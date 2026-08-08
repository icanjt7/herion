#!/usr/bin/env node

import { createDecipheriv, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const projectRef = process.env.SUPABASE_PROJECT_REF || '';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN || '';
const key = Buffer.from(process.env.RAG_TABLE_DATA_KEY || '', 'base64');
const encryptedPath = process.argv[2];
if (!projectRef || !accessToken || key.length !== 32 || !encryptedPath) {
  throw new Error('SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN, RAG_TABLE_DATA_KEY, and encrypted path are required.');
}

const packageBytes = readFileSync(encryptedPath);
const magic = packageBytes.subarray(0, 4);
if (magic.toString('ascii') !== 'HRT1') throw new Error('Unsupported table package format.');
const nonce = packageBytes.subarray(4, 16);
const ciphertextAndTag = packageBytes.subarray(16);
const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);
const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);
const decipher = createDecipheriv('aes-256-gcm', key, nonce);
decipher.setAAD(magic);
decipher.setAuthTag(tag);
const plaintext = gunzipSync(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
const tables = JSON.parse(plaintext.toString('utf8'));
if (!Array.isArray(tables) || !tables.length) throw new Error('Decrypted table package is empty.');

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
async function query(sql) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql, read_only: false }),
  });
  if (!response.ok) throw new Error(`Database query failed (${response.status}): ${await response.text()}`);
  return response.json();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const batchId = randomUUID();
const batchSize = 20;
for (let offset = 0; offset < tables.length; offset += batchSize) {
  const batch = tables.slice(offset, offset + batchSize);
  await query(`select public.import_rag_tables(${sqlLiteral(JSON.stringify(batch))}::jsonb, '${batchId}'::uuid);`);
  process.stdout.write(`Imported ${Math.min(offset + batch.length, tables.length)}/${tables.length}\n`);
}

const sourceFiles = [...new Set(tables.map((table) => table.source_file).filter(Boolean))];
await query(
  `delete from public.rag_tables where source_file in (${sourceFiles.map(sqlLiteral).join(',')}) ` +
  `and import_batch_id <> '${batchId}'::uuid;`,
);
const result = await query(
  `select count(*)::integer as table_count, coalesce(sum(jsonb_array_length(cells)), 0)::integer as cell_count ` +
  `from public.rag_tables where import_batch_id = '${batchId}'::uuid;`,
);
process.stdout.write(`${JSON.stringify(result)}\n`);
