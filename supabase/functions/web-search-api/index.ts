const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const retryableStatuses = new Set([429, 500, 502, 503, 504]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function isValidCardNumber(candidate: string) {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function containsSensitiveData(value: string) {
  if (/\b\d{6}\s*[- ]?\s*[1-8]\d{6}\b/.test(value)) return true;
  if (/\b01[016789](?:[-.\s]?\d){7,8}\b/.test(value)) return true;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) return true;
  if (/\b[MSROD]\d{8}\b/i.test(value)) return true;
  if (/계좌(?:\s*번호)?\s*[:：]?\s*\d(?:[-\s]?\d){8,15}/.test(value)) return true;
  return (value.match(/(?:\d[ -]?){13,19}/g) || []).some(isValidCardNumber);
}

function safeUrl(value: unknown) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function normalizePayload(payload: Record<string, unknown>) {
  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  const results = rawResults.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const result = item as Record<string, unknown>;
    const url = safeUrl(result.url);
    if (!url) return [];
    return [{
      title: String(result.title || url).trim().slice(0, 300),
      url,
      content: String(result.content || '').trim().slice(0, 1200),
      score: Number.isFinite(Number(result.score)) ? Number(result.score) : null,
    }];
  });
  return {
    answer: String(payload.answer || '').trim().slice(0, 2500),
    results,
  };
}

async function requestTavily(apiKey: string, query: string) {
  return fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      topic: 'general',
      search_depth: 'advanced',
      max_results: 8,
      include_answer: 'advanced',
      include_raw_content: false,
      include_images: false,
    }),
    signal: AbortSignal.timeout(25_000),
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const apiKey = Deno.env.get('TAVILY_API_KEY');
    if (!apiKey) {
      return json({
        error: '웹 검색 API 설정이 완료되지 않았습니다.',
        code: 'WEB_SEARCH_NOT_CONFIGURED',
      }, 503);
    }

    const body = await request.json();
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    if (query.length < 2 || query.length > 1000) {
      return json({ error: '검색어는 2자 이상 1,000자 이하여야 합니다.' }, 400);
    }
    if (containsSensitiveData(query)) {
      return json({
        error: '개인정보가 포함된 검색 요청은 사용할 수 없습니다.',
        code: 'SENSITIVE_DATA_BLOCKED',
      }, 400);
    }

    let upstream = await requestTavily(apiKey, query);
    if (retryableStatuses.has(upstream.status)) {
      await upstream.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 500));
      upstream = await requestTavily(apiKey, query);
    }

    const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
    if (!upstream.ok) {
      return json({
        error: String(payload.detail || payload.error || '웹 검색 서비스 요청에 실패했습니다.'),
        code: upstream.status === 429 ? 'WEB_SEARCH_LIMITED' : 'WEB_SEARCH_UPSTREAM_ERROR',
        upstream_status: upstream.status,
      }, upstream.status === 429 ? 429 : 502);
    }

    return json(normalizePayload(payload));
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'TimeoutError';
    return json({
      error: isTimeout
        ? '웹 검색 서비스 응답 시간이 초과되었습니다.'
        : (error instanceof Error ? error.message : 'Unknown error'),
      code: isTimeout ? 'WEB_SEARCH_TIMEOUT' : 'WEB_SEARCH_ERROR',
    }, isTimeout ? 504 : 500);
  }
});
