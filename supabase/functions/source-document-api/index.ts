import { SOURCE_DOCUMENTS } from './source-documents.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-herian-user-email',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function serviceEnvironment() {
  const url = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !serviceKey) throw new Error('Supabase service configuration is missing.');
  return { url, serviceKey };
}

async function verifyRegisteredEmployee(request: Request) {
  const email = (request.headers.get('x-herian-user-email') || '').trim().toLowerCase();
  if (!/^[^@\s]+@kh\.or\.kr$/.test(email)) return '';
  const { url, serviceKey } = serviceEnvironment();
  const endpoint = `${url}/rest/v1/employees?select=email&email=eq.${encodeURIComponent(email)}&limit=1`;
  const response = await fetch(endpoint, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok) return '';
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? email : '';
}

function sourceKey() {
  const value = Deno.env.get('SOURCE_DOCUMENT_KEY')?.trim() || '';
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(value), character => character.charCodeAt(0));
  } catch {
    bytes = new Uint8Array();
  }
  if (bytes.length !== 32) throw new Error('SOURCE_DOCUMENT_KEY is not configured correctly.');
  return bytes;
}

async function decryptDocument(document: typeof SOURCE_DOCUMENTS[number]) {
  const packageBytes = await Deno.readFile(new URL(document.assetPath, import.meta.url));
  if (new TextDecoder().decode(packageBytes.slice(0, 4)) !== 'HSD1') {
    throw new Error('Unsupported source document package.');
  }
  const keyBytes = sourceKey();
  const rawKey = new ArrayBuffer(keyBytes.byteLength);
  new Uint8Array(rawKey).set(keyBytes);
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  const aad = new TextEncoder().encode(`HSD1:${document.id}`);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: packageBytes.slice(4, 16), additionalData: aad },
    key,
    packageBytes.slice(16),
  ));
  if (plaintext.length !== document.size) throw new Error('Source document size validation failed.');
  const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', plaintext)))
    .map(value => value.toString(16).padStart(2, '0')).join('');
  if (checksum !== document.plaintextSha256) throw new Error('Source document checksum validation failed.');
  return plaintext;
}

function asciiDownloadName(mediaType: string) {
  if (mediaType === 'application/pdf') return 'source-document.pdf';
  if (mediaType.includes('spreadsheetml')) return 'source-document.xlsx';
  return 'source-document.bin';
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  try {
    if (!await verifyRegisteredEmployee(request)) {
      return json({ error: '등록된 국가유산진흥원 사용자만 원문을 다운로드할 수 있습니다.' }, 403);
    }
    const id = new URL(request.url).searchParams.get('id')?.trim() || '';
    const document = SOURCE_DOCUMENTS.find(item => item.id === id);
    if (!document) return json({ error: '다운로드할 원문을 찾지 못했습니다.' }, 404);
    const bytes = await decryptDocument(document);
    const encodedName = encodeURIComponent(document.fileName).replaceAll("'", '%27');
    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': document.mediaType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${asciiDownloadName(document.mediaType)}"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return json({ error: '원문 파일을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 500);
  }
});
