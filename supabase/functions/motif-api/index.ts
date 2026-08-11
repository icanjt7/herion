const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const upstreamUrl = 'https://chat-azure.motiftech.io/openapi/v1/chat/completions';
const openRouterUpstreamUrl = 'https://openrouter.ai/api/v1/chat/completions';
const openRouterFreeModel = 'openrouter/free';
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
    typeof (message as Record<string, unknown>).content === 'string'
  );
}

function isValidCardNumber(candidate: string) {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function detectSensitiveData(value: string) {
  const detected = new Set<string>();
  if (/\b\d{6}\s*[- ]?\s*[1-8]\d{6}\b/.test(value)) detected.add('주민·외국인등록번호');
  if (/\b01[016789](?:[-.\s]?\d){7,8}\b/.test(value)) detected.add('휴대전화번호');
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) detected.add('이메일 주소');
  if (/\b[MSROD]\d{8}\b/i.test(value)) detected.add('여권번호');
  if (/계좌(?:\s*번호)?\s*[:：]?\s*\d(?:[-\s]?\d){8,15}/.test(value)) detected.add('계좌번호');
  const cardCandidates = value.match(/(?:\d[ -]?){13,19}/g) || [];
  if (cardCandidates.some(isValidCardNumber)) detected.add('카드번호');
  return [...detected];
}

function shouldRetry(response: Response) {
  if ([429, 502, 503, 504].includes(response.status)) return true;
  const contentType = response.headers.get('content-type') || '';
  return response.status === 403 && contentType.includes('text/html');
}

function containsAttachedContent(messages: Array<{ role: string; content: string }>) {
  return messages.some((message) => message.content.includes('[첨부파일:'));
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
    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    const allowOpenRouterInternalData = Deno.env.get('OPENROUTER_ALLOW_INTERNAL_DATA') === 'true';
    if (!apiKey && !openRouterApiKey) return json({ error: 'No AI provider API key is configured' }, 500);

    const body = await request.json();
    if (!validMessages(body?.messages)) {
      return json({ error: 'A valid text messages array is required' }, 400);
    }

    const sensitiveTypes = new Set<string>();
    for (const message of body.messages) {
      for (const type of detectSensitiveData(message.content)) sensitiveTypes.add(type);
    }
    if (sensitiveTypes.size > 0) {
      return json({
        error: '개인정보 보호를 위해 요청이 차단되었습니다. 개인정보를 삭제하거나 마스킹한 뒤 다시 시도해 주세요.',
        code: 'SENSITIVE_DATA_BLOCKED',
        detected_types: [...sensitiveTypes],
      }, 400);
    }

    const payload: Record<string, unknown> = {
      model: 'motif3',
      messages: body.messages,
      stream: body.stream === true,
      max_tokens: body.max_tokens ?? 16384,
      temperature: body.temperature ?? 0.6,
    };
    for (const field of optionalFields) {
      if (body[field] !== undefined) payload[field] = body[field];
    }
    if (body.stream === true) payload.stream_options = { include_usage: true };

    const requestUpstream = (
      url: string,
      providerApiKey: string,
      requestPayload: Record<string, unknown>,
      extraHeaders: Record<string, string> = {},
    ) => fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${providerApiKey}`,
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(600_000),
      });

    let upstream: Response | undefined;
    let provider = 'Motif3';
    if (apiKey) {
      try {
        upstream = await requestUpstream(upstreamUrl, apiKey, payload);
        if (shouldRetry(upstream)) {
          await upstream.body?.cancel();
          await new Promise((resolve) => setTimeout(resolve, 500));
          upstream = await requestUpstream(upstreamUrl, apiKey, payload);
        }
      } catch (error) {
        console.error('Motif3 request failed:', error instanceof Error ? error.message : error);
      }
    }

    if (body.stream === true && upstream && shouldRetry(upstream) && apiKey) {
      await upstream.body?.cancel();
      const fallbackPayload = { ...payload, stream: false };
      delete fallbackPayload.stream_options;
      const fallback = await requestUpstream(upstreamUrl, apiKey, fallbackPayload);
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

    const blocksOpenRouter = containsAttachedContent(body.messages) && !allowOpenRouterInternalData;
    if (!upstream?.ok && openRouterApiKey && !blocksOpenRouter) {
      await upstream?.body?.cancel();
      const openRouterPayload: Record<string, unknown> = {
        ...payload,
        model: openRouterFreeModel,
        max_tokens: Math.min(Number(payload.max_tokens) || 4096, 4096),
      };
      upstream = await requestUpstream(
        openRouterUpstreamUrl,
        openRouterApiKey,
        openRouterPayload,
        {
          'HTTP-Referer': 'https://icanjt7.github.io/herion/',
          'X-OpenRouter-Title': 'Herian',
        },
      );
      provider = 'OpenRouter Free';
    }

    if (!upstream) {
      return json({ error: blocksOpenRouter
        ? '첨부 문서는 승인되지 않은 무료 모델로 전송하지 않습니다.'
        : 'AI provider connection failed' }, 503);
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
        error: `${provider} 연결이 일시적으로 거부되었습니다. 잠시 후 다시 시도해 주세요.`,
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
