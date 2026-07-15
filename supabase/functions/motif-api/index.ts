const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const upstreamUrl = 'https://chat-azure.motiftech.io/openapi/v1/chat/completions';
const allowedRoles = new Set(['system', 'user', 'assistant']);
const optionalFields = [
  'max_tokens', 'temperature', 'top_p', 'frequency_penalty',
  'presence_penalty', 'seed', 'stop', 'response_format',
] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function validMessages(value: unknown): value is Array<{ role: string; content: string }> {
  return Array.isArray(value) && value.length > 0 && value.length <= 50 && value.every((message) =>
    message && typeof message === 'object' &&
    allowedRoles.has(String((message as Record<string, unknown>).role)) &&
    typeof (message as Record<string, unknown>).content === 'string' &&
    String((message as Record<string, unknown>).content).length <= 100_000
  );
}

function shouldRetry(response: Response) {
  if ([429, 502, 503, 504].includes(response.status)) return true;
  const contentType = response.headers.get('content-type') || '';
  return response.status === 403 && contentType.includes('text/html');
}

function streamFromCompletion(data: Record<string, any>) {
  const message = data.choices?.[0]?.message;
  const content = typeof message?.content === 'string' ? message.content : '';
  const finishReason = data.choices?.[0]?.finish_reason || 'stop';
  const encoder = new TextEncoder();
  const events = [
    {
      id: data.id || 'chatcmpl-fallback',
      object: 'chat.completion.chunk',
      created: data.created || Math.floor(Date.now() / 1000),
      model: data.model || 'motif3',
      choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }],
      usage: null,
    },
    {
      id: data.id || 'chatcmpl-fallback',
      object: 'chat.completion.chunk',
      created: data.created || Math.floor(Date.now() / 1000),
      model: data.model || 'motif3',
      choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
      usage: null,
    },
    { choices: [], usage: data.usage || null },
  ];

  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const apiKey = Deno.env.get('MOTIF_API_KEY');
    if (!apiKey) return json({ error: 'MOTIF_API_KEY is not configured' }, 500);

    const body = await request.json();
    if (!validMessages(body?.messages)) {
      return json({ error: 'A valid text messages array is required' }, 400);
    }

    const payload: Record<string, unknown> = {
      model: 'motif3',
      messages: body.messages,
      stream: body.stream === true,
      max_tokens: body.max_tokens ?? 4096,
      temperature: body.temperature ?? 0.6,
    };
    for (const field of optionalFields) {
      if (body[field] !== undefined) payload[field] = body[field];
    }
    if (body.stream === true) payload.stream_options = { include_usage: true };

    const requestUpstream = (requestPayload: Record<string, unknown>) => fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(120_000),
      });

    let upstream = await requestUpstream(payload);
    if (shouldRetry(upstream)) {
      await upstream.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 500));
      upstream = await requestUpstream(payload);
    }

    if (body.stream === true && shouldRetry(upstream)) {
      await upstream.body?.cancel();
      const fallbackPayload = { ...payload, stream: false };
      delete fallbackPayload.stream_options;
      const fallback = await requestUpstream(fallbackPayload);
      if (fallback.ok) {
        const completion = await fallback.json();
        return new Response(streamFromCompletion(completion), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
          },
        });
      }
      upstream = fallback;
    }

    if (body.stream === true && upstream.ok && upstream.body) {
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    const responseBody = await upstream.text();
    if (!upstream.ok && responseBody.trimStart().startsWith('<')) {
      return json({
        error: 'Motif3 연결이 일시적으로 거부되었습니다. 잠시 후 다시 시도해 주세요.',
        upstream_status: upstream.status,
      }, 503);
    }
    return new Response(responseBody, {
      status: upstream.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
