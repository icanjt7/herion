import {
  invalidateRagOverrideCache,
  listRagChunksForAdmin,
  type RagChunkOverride,
} from '../motif-api/rag.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-herian-admin-email',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

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

function env() {
  const url = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) throw new Error('Supabase service configuration is missing.');
  return { url, key };
}

function serviceHeaders(prefer?: string) {
  const { key } = env();
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function verifyAdmin(request: Request) {
  const email = (request.headers.get('x-herian-admin-email') || '').trim().toLowerCase();
  if (!/^[^@\s]+@kh\.or\.kr$/.test(email)) return '';
  const { url } = env();
  const endpoint = `${url}/rest/v1/employees?select=email&email=eq.${encodeURIComponent(email)}&role=eq.admin&limit=1`;
  const response = await fetch(endpoint, { headers: serviceHeaders() });
  if (!response.ok) return '';
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? email : '';
}

function text(value: unknown, maxLength: number, required = false) {
  const result = typeof value === 'string' ? value.normalize('NFC').trim().slice(0, maxLength) : '';
  if (required && !result) throw new Error('필수 입력값을 확인해 주세요.');
  return result;
}

function nullableNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isInteger(result) && result > 0 ? result : null;
}

function normalizePayload(body: Record<string, unknown>, adminEmail: string) {
  const regulations = Array.isArray(body.related_regulations)
    ? body.related_regulations
    : String(body.related_regulations || '').split(/[\n,]/);
  return {
    base_chunk_id: text(body.base_chunk_id, 300) || null,
    document_title: text(body.document_title, 300, true),
    chapter_title: text(body.chapter_title, 500),
    section_title: text(body.section_title, 500),
    text: text(body.text, 20000, true),
    collection: text(body.collection, 120) || 'admin-overlay',
    source_file: text(body.source_file, 500),
    revision_basis: text(body.revision_basis, 500),
    source_line_start: nullableNumber(body.source_line_start),
    source_line_end: nullableNumber(body.source_line_end),
    unit_type: text(body.unit_type, 80) || null,
    related_regulations: regulations.map((item) => text(item, 300)).filter(Boolean).slice(0, 30),
    department: text(body.department, 200) || null,
    is_active: body.is_active !== false,
    updated_by_email: adminEmail,
    updated_at: new Date().toISOString(),
  };
}

async function findOverride(id: string) {
  const { url } = env();
  const response = await fetch(
    `${url}/rest/v1/rag_chunk_overrides?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
    { headers: serviceHeaders() },
  );
  if (!response.ok) throw new Error('수정 청크를 조회하지 못했습니다.');
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] as RagChunkOverride | undefined : undefined;
}

async function addRevision(action: string, snapshot: unknown, adminEmail: string, overrideId?: string | null) {
  const { url } = env();
  const response = await fetch(`${url}/rest/v1/rag_chunk_override_revisions`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({ override_id: overrideId || null, action, snapshot, admin_email: adminEmail }),
  });
  if (!response.ok) throw new Error('변경 이력을 저장하지 못했습니다.');
}

async function saveOverride(body: Record<string, unknown>, adminEmail: string) {
  const payload = normalizePayload(body, adminEmail);
  const overrideId = text(body.override_id, 100);
  const { url } = env();
  let before: RagChunkOverride | undefined;
  let endpoint = `${url}/rest/v1/rag_chunk_overrides`;
  let method = 'POST';
  const data: Record<string, unknown> = { ...payload, created_by_email: adminEmail };
  if (overrideId) {
    before = await findOverride(overrideId);
    if (!before) throw new Error('수정할 청크를 찾을 수 없습니다.');
    endpoint += `?id=eq.${encodeURIComponent(overrideId)}`;
    method = 'PATCH';
    delete data.created_by_email;
  }
  const response = await fetch(endpoint, {
    method,
    headers: serviceHeaders('return=representation'),
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`청크를 저장하지 못했습니다. (${response.status})`);
  const rows = await response.json();
  const saved = rows?.[0] as RagChunkOverride | undefined;
  if (!saved) throw new Error('저장 결과를 확인하지 못했습니다.');
  const action = before ? (saved.is_active ? 'update' : 'disable') : 'create';
  await addRevision(action, { before: before || null, after: saved }, adminEmail, saved.id);
  invalidateRagOverrideCache();
  return saved;
}

async function restoreOrDelete(body: Record<string, unknown>, adminEmail: string) {
  const overrideId = text(body.override_id, 100, true);
  const before = await findOverride(overrideId);
  if (!before) throw new Error('대상 청크를 찾을 수 없습니다.');
  const { url } = env();
  const response = await fetch(
    `${url}/rest/v1/rag_chunk_overrides?id=eq.${encodeURIComponent(overrideId)}`,
    { method: 'DELETE', headers: serviceHeaders() },
  );
  if (!response.ok) throw new Error('청크를 복원 또는 삭제하지 못했습니다.');
  const action = before.base_chunk_id ? 'restore' : 'delete';
  await addRevision(action, { before, after: null }, adminEmail, before.id);
  invalidateRagOverrideCache();
  return { action };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const adminEmail = await verifyAdmin(request);
    if (!adminEmail) return json({ error: '관리자 권한을 확인할 수 없습니다.' }, 403);

    if (request.method === 'GET') {
      const url = new URL(request.url);
      const result = await listRagChunksForAdmin({
        query: url.searchParams.get('q') || '',
        document: url.searchParams.get('document') || '',
        page: Number(url.searchParams.get('page') || 1),
        pageSize: Number(url.searchParams.get('page_size') || 20),
      });
      return json(result);
    }

    if (request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>;
      const action = text(body.action, 20);
      if (action === 'save') return json({ data: await saveOverride(body, adminEmail) });
      if (action === 'restore') return json({ data: await restoreOrDelete(body, adminEmail) });
      return json({ error: '지원하지 않는 작업입니다.' }, 400);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.' }, 500);
  }
});
