const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const allowedPaths = new Set(['lawSearch.do', 'lawService.do']);
const allowedParams = new Set([
  'target', 'type', 'query', 'display', 'page', 'sort', 'search',
  'ID', 'MST', 'JO', 'HANG', 'HO', 'MOK', 'efYd',
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function removeOcFromLinks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeOcFromLinks);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, removeOcFromLinks(child)]),
    );
  }
  if (typeof value !== 'string' || !/[?&]OC=/i.test(value)) return value;

  try {
    const absolute = /^https?:\/\//i.test(value);
    const url = new URL(value, 'https://www.law.go.kr');
    url.searchParams.delete('OC');
    return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value.replace(/([?&])OC=[^&]*&?/gi, (_match, separator) =>
      separator === '?' ? '?' : '',
    ).replace(/\?$/, '');
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const oc = Deno.env.get('LAW_API_OC');
    if (!oc) return json({ error: 'LAW_API_OC is not configured' }, 500);

    const body = await request.json();
    const path = String(body?.path || '');
    const params = body?.params;
    if (!allowedPaths.has(path) || !params || typeof params !== 'object') {
      return json({ error: 'Invalid law API request' }, 400);
    }

    const url = new URL(`https://www.law.go.kr/DRF/${path}`);
    url.searchParams.set('OC', oc);
    url.searchParams.set('type', 'JSON');

    for (const [key, value] of Object.entries(params)) {
      if (!allowedParams.has(key) || value == null || value === '') continue;
      url.searchParams.set(key, String(value).slice(0, 200));
    }

    if (url.searchParams.get('target') !== 'law') {
      return json({ error: 'Only the law target is allowed' }, 400);
    }

    const upstream = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const text = await upstream.text();
    let responseBody = text;
    try {
      responseBody = JSON.stringify(removeOcFromLinks(JSON.parse(text))) ?? text;
    } catch {
      // Preserve upstream error bodies that are not JSON.
    }
    return new Response(responseBody, {
      status: upstream.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
