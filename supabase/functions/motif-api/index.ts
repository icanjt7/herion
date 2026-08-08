import { buildRagContext, buildRagUnavailableContext } from './rag.ts';
import { detectSensitiveData } from '../_shared/sensitive-data.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const motifUpstreamUrl = 'https://chat-azure.motiftech.io/openapi/v1/chat/completions';
const nvidiaUpstreamUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
const nvidiaModel = 'nvidia/llama-3.3-nemotron-super-49b-v1.5';
const nvidia70bModel = 'meta/llama-3.3-70b-instruct';
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

function appendSystemContext(messages: Array<{ role: string; content: string }>, context: string) {
  if (!context) return messages;
  const systemIndex = messages.findIndex((message) => message.role === 'system');
  if (systemIndex < 0) return [{ role: 'system', content: context.trim() }, ...messages];
  return messages.map((message, index) => index === systemIndex
    ? { ...message, content: `${message.content}${context}` }
    : message);
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
    const motifApiKey = Deno.env.get('MOTIF_API_KEY');
    const llamaApiKey = Deno.env.get('LLAMA33');
    const llama70bApiKey = Deno.env.get('LLAMA33_70B');
    if (!motifApiKey && !llamaApiKey && !llama70bApiKey) {
      return json({ error: 'No AI provider API key is configured' }, 500);
    }

    const body = await request.json();
    if (!validMessages(body?.messages)) {
      return json({ error: 'A valid text messages array is required' }, 400);
    }

    const requestMessages = body.messages as Array<{ role: string; content: string }>;
    const sensitiveTypes = new Set<string>();
    for (const message of requestMessages.filter((message) => message.role === 'user')) {
      for (const type of detectSensitiveData(message.content)) sensitiveTypes.add(type);
    }
    if (sensitiveTypes.size > 0) {
      return json({
        error: '개인정보 보호를 위해 요청이 차단되었습니다. 개인정보를 삭제하거나 마스킹한 뒤 다시 시도해 주세요.',
        code: 'SENSITIVE_DATA_BLOCKED',
        detected_types: [...sensitiveTypes],
      }, 400);
    }

    let messages = requestMessages;
    try {
      const ragContext = await buildRagContext(body.rag_query);
      messages = appendSystemContext(messages, ragContext);
    } catch (error) {
      console.error('RAG retrieval failed:', error instanceof Error ? error.message : error);
      messages = appendSystemContext(messages, buildRagUnavailableContext(body.rag_query, 'error'));
    }

    const payload: Record<string, unknown> = {
      model: 'motif3',
      messages,
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
      apiKey: string,
      requestPayload: Record<string, unknown>,
    ) => fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(600_000),
      });

    let upstream: Response | undefined;
    let provider = 'Motif3';

    if (motifApiKey) {
      try {
        upstream = await requestUpstream(motifUpstreamUrl, motifApiKey, payload);
        if (shouldRetry(upstream)) {
          await upstream.body?.cancel();
          await new Promise((resolve) => setTimeout(resolve, 500));
          upstream = await requestUpstream(motifUpstreamUrl, motifApiKey, payload);
        }
      } catch (error) {
        console.error('Motif3 request failed:', error instanceof Error ? error.message : error);
      }
    }

    if (body.stream === true && upstream && shouldRetry(upstream) && motifApiKey) {
      await upstream.body?.cancel();
      const fallbackPayload: Record<string, unknown> = { ...payload, stream: false };
      delete fallbackPayload.stream_options;
      try {
        const fallback = await requestUpstream(motifUpstreamUrl, motifApiKey, fallbackPayload);
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
      } catch (error) {
        console.error('Motif3 non-streaming retry failed:', error instanceof Error ? error.message : error);
      }
    }

    const fallbackProviders = [
      { apiKey: llamaApiKey, model: nvidiaModel, name: 'NVIDIA Llama 3.3 Nemotron' },
      { apiKey: llama70bApiKey, model: nvidia70bModel, name: 'NVIDIA Llama 3.3 70B' },
    ];
    for (const fallbackProvider of fallbackProviders) {
      if (upstream?.ok || !fallbackProvider.apiKey) continue;
      await upstream?.body?.cancel();
      upstream = undefined;
      const fallbackPayload: Record<string, unknown> = {
        ...payload,
        model: fallbackProvider.model,
        max_tokens: Math.min(Number(payload.max_tokens) || 16384, 65536),
        top_p: body.top_p ?? 0.95,
        frequency_penalty: body.frequency_penalty ?? 0,
        presence_penalty: body.presence_penalty ?? 0,
      };
      try {
        upstream = await requestUpstream(nvidiaUpstreamUrl, fallbackProvider.apiKey, fallbackPayload);
        provider = fallbackProvider.name;
      } catch (error) {
        console.error(`${fallbackProvider.name} fallback failed:`, error instanceof Error ? error.message : error);
      }
    }

    if (!upstream) {
      return json({ error: 'AI provider connection failed' }, 503);
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
