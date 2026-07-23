const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const defaultModel = '@cf/black-forest-labs/flux-1-schnell';

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

function cloudflareErrors(payload: Record<string, unknown>) {
  return Array.isArray(payload.errors)
    ? payload.errors.filter(error => error && typeof error === 'object') as Array<Record<string, unknown>>
    : [];
}

function isDailyLimitError(status: number, payload: Record<string, unknown>) {
  return status === 429 && cloudflareErrors(payload).some(error => Number(error.code) === 3036);
}

function imageDataUrl(value: string) {
  if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(value)) return value;
  const mime = value.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${value}`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const apiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
    const model = Deno.env.get('CLOUDFLARE_IMAGE_MODEL') || defaultModel;
    if (!accountId || !apiToken) {
      return json({
        error: 'Cloudflare 이미지 생성 설정이 완료되지 않았습니다.',
        code: 'IMAGE_API_NOT_CONFIGURED',
      }, 503);
    }

    const body = await request.json();
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 2048) {
      return json({ error: '이미지 생성 요청은 1자 이상 2,048자 이하여야 합니다.' }, 400);
    }

    const sensitiveTypes = detectSensitiveData(prompt);
    if (sensitiveTypes.length) {
      return json({
        error: '개인정보가 포함된 이미지 생성 요청은 사용할 수 없습니다.',
        code: 'SENSITIVE_DATA_BLOCKED',
        detected_types: sensitiveTypes,
      }, 400);
    }

    const upstream = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, steps: 4 }),
        signal: AbortSignal.timeout(120_000),
      },
    );

    const contentType = upstream.headers.get('content-type') || '';
    if (upstream.ok && contentType.startsWith('image/')) {
      const bytes = new Uint8Array(await upstream.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return json({ image: `data:${contentType.split(';')[0]};base64,${btoa(binary)}`, model });
    }

    const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
    if (isDailyLimitError(upstream.status, payload)) {
      return json({
        error: 'Cloudflare의 금일 무료 이미지 생성 한도를 모두 사용했습니다. 금일은 더 생성할 수 없습니다.',
        code: 'DAILY_LIMIT_EXHAUSTED',
      }, 429);
    }
    if (!upstream.ok || payload.success === false) {
      const errors = cloudflareErrors(payload);
      const message = errors.map(error => String(error.message || '')).filter(Boolean).join(' / ');
      return json({
        error: message || 'Cloudflare 이미지 생성 요청에 실패했습니다.',
        code: upstream.status === 429 ? 'IMAGE_GENERATION_UNAVAILABLE' : 'CLOUDFLARE_API_ERROR',
      }, upstream.status || 502);
    }

    const result = payload.result;
    const encoded = typeof result === 'string'
      ? result
      : (result && typeof result === 'object' && typeof (result as Record<string, unknown>).image === 'string'
        ? String((result as Record<string, unknown>).image)
        : '');
    if (!encoded) return json({ error: 'Cloudflare가 이미지 데이터를 반환하지 않았습니다.' }, 502);
    return json({ image: imageDataUrl(encoded), model });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
