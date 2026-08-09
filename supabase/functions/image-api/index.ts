import { detectSensitiveData } from '../_shared/sensitive-data.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const defaultModel = '@cf/black-forest-labs/flux-1-schnell';
const nemotronVisionModel = 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1';
const nvidiaChatUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
const accountIdPattern = /^[a-f0-9]{32}$/i;
const modelPattern = /^@cf\/[a-z0-9._-]+\/[a-z0-9._-]+$/i;
const visionImagePattern = /^data:image\/(?:png|jpeg);base64,([a-z0-9+/=]+)$/i;
const maxVisionImageBytes = 4 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}

function cloudflareErrors(payload: Record<string, unknown>) {
  return Array.isArray(payload.errors)
    ? payload.errors.filter(error => error && typeof error === 'object') as Array<Record<string, unknown>>
    : [];
}

function isDailyLimitError(status: number, payload: Record<string, unknown>) {
  return status === 429 && cloudflareErrors(payload).some(error => Number(error.code) === 3036);
}

function isCloudflareConfigurationError(status: number, payload: Record<string, unknown>) {
  if (![400, 401, 403, 404].includes(status)) return false;
  return cloudflareErrors(payload).some((error) => {
    const code = Number(error.code);
    const message = String(error.message || '');
    return code === 7003 || /could not route|object identifier is invalid|authentication/i.test(message);
  });
}

function imageDataUrl(value: string) {
  if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(value)) return value;
  const mime = value.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${value}`;
}

function assistantText(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const message = choices[0] && typeof choices[0] === 'object'
    ? (choices[0] as Record<string, unknown>).message
    : null;
  return message && typeof message === 'object'
    ? String((message as Record<string, unknown>).content || '').trim()
    : '';
}

function validateVisionImage(value: unknown) {
  const image = typeof value === 'string' ? value.trim() : '';
  const match = image.match(visionImagePattern);
  if (!match) throw new Error('이미지 인식은 PNG 또는 JPEG 형식만 지원합니다.');
  const estimatedBytes = Math.floor(match[1].replace(/=+$/, '').length * 3 / 4);
  if (!estimatedBytes || estimatedBytes > maxVisionImageBytes) {
    throw new Error('이미지 인식용 파일은 4MB 이하여야 합니다.');
  }
  return image;
}

async function requestNemotron(apiKey: string, prompt: string, image = '') {
  const content = image
    ? [
        { type: 'image_url', image_url: { url: image } },
        { type: 'text', text: prompt },
      ]
    : prompt;
  const upstream = await fetch(nvidiaChatUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      model: nemotronVisionModel,
      messages: [{ role: 'user', content }],
      temperature: 0,
      top_p: 1,
      max_tokens: image ? 1800 : 500,
      stream: false,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
  if (!upstream.ok) {
    throw new Error(`NVIDIA Nemotron VL 요청에 실패했습니다 (${upstream.status}).`);
  }
  const text = assistantText(payload);
  if (!text) throw new Error('NVIDIA Nemotron VL이 분석 결과를 반환하지 않았습니다.');
  return text;
}

async function analyzeImage(body: Record<string, unknown>, nemotronKey: string) {
  if (!nemotronKey) {
    return json({
      error: 'NVIDIA 이미지 인식 설정이 완료되지 않았습니다.',
      code: 'VISION_API_NOT_CONFIGURED',
    }, 503);
  }
  let image = '';
  try {
    image = validateVisionImage(body.image);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '올바른 이미지가 아닙니다.' }, 400);
  }
  const prompt = typeof body.prompt === 'string' && body.prompt.trim()
    ? body.prompt.trim().slice(0, 1600)
    : 'Analyze this image in detail. Extract all visible text exactly, describe objects and layout, and preserve table rows and columns. Return factual text only.';
  const sensitiveTypes = detectSensitiveData(prompt);
  if (sensitiveTypes.length) {
    return json({
      error: '개인정보가 포함된 이미지 분석 요청은 사용할 수 없습니다.',
      code: 'SENSITIVE_DATA_BLOCKED',
      detected_types: sensitiveTypes,
    }, 400);
  }
  const analysis = await requestNemotron(nemotronKey, prompt, image);
  const detectedInResult = detectSensitiveData(analysis);
  if (detectedInResult.length) {
    return json({
      error: '이미지에서 개인정보가 감지되어 분석 결과를 표시하지 않았습니다.',
      code: 'SENSITIVE_DATA_BLOCKED',
      detected_types: detectedInResult,
    }, 400);
  }
  return json({ analysis, model: nemotronVisionModel });
}

async function enhanceImagePrompt(prompt: string, nemotronKey: string) {
  if (!nemotronKey) return prompt;
  try {
    const enhanced = await requestNemotron(
      nemotronKey,
      `Rewrite the following request as one concise English text-to-image prompt. Preserve every subject, style, color, composition, and text requirement. Output only the prompt.\n\n${prompt}`,
    );
    return enhanced.slice(0, 2048) || prompt;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return prompt;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await request.json() as Record<string, unknown>;
    const nemotronKey = Deno.env.get('NEMOTRON_VL')?.trim() || '';
    if (body.action === 'analyze' || body.image) return await analyzeImage(body, nemotronKey);

    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')?.trim();
    const apiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
    const model = Deno.env.get('CLOUDFLARE_IMAGE_MODEL')?.trim() || defaultModel;
    if (!accountId || !apiToken) {
      return json({
        error: 'Cloudflare 이미지 생성 설정이 완료되지 않았습니다.',
        code: 'IMAGE_API_NOT_CONFIGURED',
      }, 503);
    }
    if (!accountIdPattern.test(accountId)) {
      return json({
        error: 'Cloudflare Account ID 설정이 올바르지 않습니다. Workers AI의 32자리 Account ID를 확인해 주세요.',
        code: 'INVALID_CLOUDFLARE_ACCOUNT_ID',
      }, 503);
    }
    if (!modelPattern.test(model)) {
      return json({
        error: 'Cloudflare 이미지 모델 설정이 올바르지 않습니다.',
        code: 'INVALID_CLOUDFLARE_IMAGE_MODEL',
      }, 503);
    }

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

    const generationPrompt = await enhanceImagePrompt(prompt, nemotronKey);
    const upstream = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: generationPrompt, steps: 4 }),
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
      return json({
        image: `data:${contentType.split(';')[0]};base64,${btoa(binary)}`,
        model,
        prompt_model: nemotronKey ? nemotronVisionModel : null,
      });
    }

    const payload = await upstream.json().catch(() => ({})) as Record<string, unknown>;
    if (isDailyLimitError(upstream.status, payload)) {
      return json({
        error: 'Cloudflare의 금일 무료 이미지 생성 한도를 모두 사용했습니다. 금일은 더 생성할 수 없습니다.',
        code: 'DAILY_LIMIT_EXHAUSTED',
      }, 429);
    }
    if (isCloudflareConfigurationError(upstream.status, payload)) {
      return json({
        error: 'Cloudflare 이미지 생성 연결 설정을 확인해 주세요. Account ID와 API Token이 같은 계정의 값이어야 합니다.',
        code: 'CLOUDFLARE_CONFIGURATION_ERROR',
      }, 503);
    }
    if (!upstream.ok || payload.success === false) {
      const errors = cloudflareErrors(payload);
      return json({
        error: 'Cloudflare 이미지 생성 요청에 실패했습니다.',
        code: upstream.status === 429 ? 'IMAGE_GENERATION_UNAVAILABLE' : 'CLOUDFLARE_API_ERROR',
        upstream_codes: errors.map(error => Number(error.code)).filter(Number.isFinite),
      }, upstream.status || 502);
    }

    const result = payload.result;
    const encoded = typeof result === 'string'
      ? result
      : (result && typeof result === 'object' && typeof (result as Record<string, unknown>).image === 'string'
        ? String((result as Record<string, unknown>).image)
        : '');
    if (!encoded) return json({ error: 'Cloudflare가 이미지 데이터를 반환하지 않았습니다.' }, 502);
    return json({
      image: imageDataUrl(encoded),
      model,
      prompt_model: nemotronKey ? nemotronVisionModel : null,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
