const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type HeritageSource = {
  domain: string;
  name: string;
  tier: '공식기관' | '1차사료' | '사전' | '보조(교차검증)';
  priority: number;
};

const retryableStatuses = new Set([429, 500, 502, 503, 504]);
const heritageSources: HeritageSource[] = [
  { domain: 'royal.khs.go.kr', name: '국가유산청 궁능유적본부', tier: '공식기관', priority: 10 },
  { domain: 'heritage.go.kr', name: '국가유산포털', tier: '공식기관', priority: 11 },
  { domain: 'nrich.go.kr', name: '국립문화유산연구원', tier: '공식기관', priority: 12 },
  { domain: 'sillok.history.go.kr', name: '조선왕조실록', tier: '1차사료', priority: 13 },
  { domain: 'contents.history.go.kr', name: '우리역사넷', tier: '공식기관', priority: 14 },
  { domain: 'khs.go.kr', name: '국가유산청', tier: '공식기관', priority: 15 },
  { domain: 'kh.or.kr', name: '국가유산진흥원', tier: '공식기관', priority: 16 },
  { domain: 'dh.aks.ac.kr', name: '위키실록사전', tier: '사전', priority: 20 },
  { domain: 'encykorea.aks.ac.kr', name: '한국민족문화대백과사전', tier: '사전', priority: 21 },
  { domain: 'koya-culture.com', name: '우리문화신문', tier: '보조(교차검증)', priority: 30 },
  { domain: 'ko.wikipedia.org', name: '위키백과', tier: '보조(교차검증)', priority: 31 },
  { domain: 'namu.wiki', name: '나무위키', tier: '보조(교차검증)', priority: 32 },
  { domain: 'terms.naver.com', name: '네이버 지식백과', tier: '보조(교차검증)', priority: 33 },
  { domain: 'korean.visitkorea.or.kr', name: '대한민국 구석구석', tier: '보조(교차검증)', priority: 34 },
  { domain: 'fnnews.com', name: '파이낸셜뉴스', tier: '보조(교차검증)', priority: 35 },
  { domain: 'museum.go.kr', name: '국립중앙박물관', tier: '보조(교차검증)', priority: 36 },
  { domain: 'gogung.go.kr', name: '국립고궁박물관', tier: '보조(교차검증)', priority: 37 },
  { domain: 'aks.ac.kr', name: '한국학중앙연구원', tier: '보조(교차검증)', priority: 38 },
];
const heritageDomains = [...new Set(heritageSources.map((source) => source.domain))];
const allowedIncludedDomains = new Set(['kh.or.kr', 'khs.go.kr', ...heritageDomains]);

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

function heritageSourceForUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return heritageSources.find((source) =>
      hostname === source.domain || hostname.endsWith(`.${source.domain}`)
    ) || null;
  } catch {
    return null;
  }
}

function normalizeResults(payload: Record<string, unknown>) {
  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  return rawResults.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const result = item as Record<string, unknown>;
    const url = safeUrl(result.url);
    if (!url) return [];
    const source = heritageSourceForUrl(url);
    return [{
      title: String(result.title || url).trim().slice(0, 300),
      url,
      content: String(result.content || '').trim().slice(0, 1200),
      score: Number.isFinite(Number(result.score)) ? Number(result.score) : null,
      source_name: source?.name || '',
      source_tier: source?.tier || '일반 웹',
      source_priority: source?.priority ?? 999,
    }];
  });
}

function mergeResults(...groups: ReturnType<typeof normalizeResults>[]) {
  const unique = new Map<string, ReturnType<typeof normalizeResults>[number]>();
  groups.flat().forEach((result) => {
    if (!unique.has(result.url)) unique.set(result.url, result);
  });
  return [...unique.values()]
    .sort((left, right) =>
      left.source_priority - right.source_priority
      || (Number(right.score) || 0) - (Number(left.score) || 0)
    )
    .slice(0, 8);
}

function normalizedResponse(
  payload: Record<string, unknown>,
  results: ReturnType<typeof normalizeResults>,
  sourceProfile = '',
  fallbackUsed = false,
) {
  return {
    answer: String(payload.answer || '').trim().slice(0, 2500),
    results,
    source_profile: sourceProfile,
    curated_result_count: results.filter((result) => result.source_priority < 999).length,
    fallback_used: fallbackUsed,
  };
}

async function requestTavily(apiKey: string, query: string, includeDomains: string[]) {
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
      ...(includeDomains.length ? { include_domains: includeDomains } : {}),
    }),
    signal: AbortSignal.timeout(25_000),
  });
}

async function searchTavily(apiKey: string, query: string, includeDomains: string[]) {
  let upstream = await requestTavily(apiKey, query, includeDomains);
  if (retryableStatuses.has(upstream.status)) {
    await upstream.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 500));
    upstream = await requestTavily(apiKey, query, includeDomains);
  }
  const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
  if (!upstream.ok) {
    const error = new Error(String(
      payload.detail || payload.error || '웹 검색 서비스 요청에 실패했습니다.'
    ));
    Object.assign(error, {
      code: upstream.status === 429 ? 'WEB_SEARCH_LIMITED' : 'WEB_SEARCH_UPSTREAM_ERROR',
      upstreamStatus: upstream.status,
    });
    throw error;
  }
  return payload;
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

    const includeDomains = (Array.isArray(body?.include_domains) ? body.include_domains : [])
      .map((value: unknown) => String(value || '').trim().toLowerCase())
      .filter((value: string) => allowedIncludedDomains.has(value))
      .slice(0, 2);

    const sourceProfile = body?.source_profile === 'heritage' ? 'heritage' : '';
    if (includeDomains.length) {
      const payload = await searchTavily(apiKey, query, includeDomains);
      return json(normalizedResponse(
        payload,
        mergeResults(normalizeResults(payload)),
        sourceProfile,
      ));
    }

    if (sourceProfile === 'heritage') {
      const curatedPayload = await searchTavily(apiKey, query, heritageDomains);
      const curatedResults = normalizeResults(curatedPayload);
      if (curatedResults.length >= 5) {
        return json(normalizedResponse(
          curatedPayload,
          mergeResults(curatedResults),
          sourceProfile,
        ));
      }

      const broadPayload = await searchTavily(apiKey, query, []);
      const merged = mergeResults(curatedResults, normalizeResults(broadPayload));
      return json(normalizedResponse(
        {
          ...broadPayload,
          answer: curatedPayload.answer || broadPayload.answer || '',
        },
        merged,
        sourceProfile,
        true,
      ));
    }

    const payload = await searchTavily(apiKey, query, []);
    return json(normalizedResponse(payload, mergeResults(normalizeResults(payload))));
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'TimeoutError';
    const upstreamStatus = Number(
      error && typeof error === 'object' && 'upstreamStatus' in error
        ? (error as { upstreamStatus?: number }).upstreamStatus
        : 0
    );
    const errorCode = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code || '')
      : '';
    return json({
      error: isTimeout
        ? '웹 검색 서비스 응답 시간이 초과되었습니다.'
        : (error instanceof Error ? error.message : 'Unknown error'),
      code: isTimeout ? 'WEB_SEARCH_TIMEOUT' : (errorCode || 'WEB_SEARCH_ERROR'),
      ...(upstreamStatus ? { upstream_status: upstreamStatus } : {}),
    }, isTimeout ? 504 : (upstreamStatus === 429 ? 429 : upstreamStatus ? 502 : 500));
  }
});
