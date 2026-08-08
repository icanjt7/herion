#!/usr/bin/env node

import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function argumentsFor(name) {
  const values = [];
  process.argv.forEach((value, index) => {
    if (value === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
  });
  return values;
}

const inputPaths = argumentsFor('--input').map(path => resolve(path));
const outputPath = resolve(argument('--output', 'supabase/functions/motif-api/rag-corpus.ts'));
const keyFile = argument('--key-file');
const exportPrefix = argument('--export-prefix', 'RAG_CORPUS').replace(/[^A-Z0-9_]/gi, '_');
const documentTitleOverride = argument('--document-title');
const sourceFileFallback = argument('--source-file');
const collectionFallback = argument('--collection');
const revisionFallback = argument('--revision');
const departmentFallback = argument('--department');
const formInventoryPath = argument('--form-inventory');
if (!inputPaths.length || (!keyFile && !process.env.RAG_DATA_KEY)) {
  throw new Error('Usage: build-rag-corpus.mjs --input chunks-a.json [--input chunks-b.json] (--key-file key.txt | RAG_DATA_KEY=...) [--output rag-corpus.ts]');
}

const keyText = keyFile
  ? readFileSync(resolve(keyFile), 'utf8').trim()
  : String(process.env.RAG_DATA_KEY || '').trim();
const key = Buffer.from(keyText, 'base64');
if (key.length !== 32) throw new Error('RAG data key must be 32 bytes encoded as base64.');

let source = inputPaths.flatMap(inputPath => {
  const rows = JSON.parse(readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`RAG source must be a non-empty JSON array: ${inputPath}`);
  return rows;
});

if (formInventoryPath) {
  const inventory = JSON.parse(readFileSync(resolve(formInventoryPath), 'utf8'));
  if (!Array.isArray(inventory)) throw new Error('Form inventory must be a JSON array.');
  const unavailableForms = inventory.filter(item => item?.extraction_status === 'image_only_or_unparsed');
  source = source.concat(unavailableForms.map((item, index) => {
    const title = String(item?.title || '').trim();
    if (!title) throw new Error(`Form inventory title is missing at index ${index}.`);
    return {
      id: `KH-WM-FORM-UNPARSED-${String(index + 1).padStart(2, '0')}`,
      document_title: documentTitleOverride,
      document_date: revisionFallback,
      department: departmentFallback,
      major_section: 'Ⅲ. (붙임) 복무관련 양식',
      subsection: title,
      unit_title: title,
      unit_type: 'form',
      text: `붙임 양식 '${title}'은 복무 편람에 수록되어 있으나 원본에서 이미지 또는 비텍스트 형식이어서 세부 내용을 추출하지 못했습니다. 양식 작성·사용 시 원본 편람 또는 담당부서(${departmentFallback || '경영지원실 인재경영팀'}) 확인이 필요합니다.`,
      metadata: {
        collection: collectionFallback,
        document_date: revisionFallback,
        source_file: sourceFileFallback,
        extraction_status: 'image_only_or_unparsed',
      },
    };
  }));
}

const normalizedChunks = source.map((item, index) => {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const uniqueParts = values => [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
  const unitType = String(item?.unit_type || metadata.unit_type || '').trim();
  const unitLabels = {
    qa: '질의응답',
    form: '붙임 양식',
    example: '예시',
    reference: '참고',
    related_regulation: '관련 규정',
  };
  const sectionParts = uniqueParts([item?.subsection, item?.minor_heading, item?.unit_title]);
  if (unitLabels[unitType]) sectionParts.unshift(`[${unitLabels[unitType]}]`);
  if (!sectionParts.length) sectionParts.push('본문');
  const relatedRegulations = Array.isArray(metadata.related_regulations)
    ? uniqueParts(metadata.related_regulations)
    : [];
  const text = String(item?.text || '').trim();
  const row = {
    id: String(item?.id || `RAG-${index + 1}`),
    document_title: String(documentTitleOverride || item?.document_title || '').trim(),
    chapter_title: String(item?.chapter_title || metadata.chapter_title || uniqueParts([
      item?.major_section,
      item?.topic,
    ]).join(' > ')).trim(),
    section_title: String(item?.section_title || sectionParts.join(' > ')).trim(),
    text,
    collection: String(metadata.collection || collectionFallback || '').trim(),
    source_file: String(metadata.source_file || sourceFileFallback || '').trim(),
    revision_basis: String(
      metadata.revision_basis || item?.document_date || metadata.document_date || revisionFallback || '',
    ).trim(),
    source_line_start: Number(metadata.source_line_start_approx) || null,
    source_line_end: Number(metadata.source_line_end_approx) || null,
    page_start: Number(metadata.page_start || item?.page_start) || null,
    page_end: Number(metadata.page_end || item?.page_end || metadata.page_start || item?.page_start) || null,
    checksum_sha256: String(item?.checksum_sha256 || createHash('sha256').update(text).digest('hex')).trim(),
    unit_type: unitType,
    related_regulations: relatedRegulations,
    department: String(item?.department || metadata.department || departmentFallback || '').trim(),
  };
  if (!row.document_title || !row.text) throw new Error(`Invalid RAG row at index ${index}.`);
  return row;
});

const ids = new Set();
const duplicateKeys = new Set();
const chunks = normalizedChunks.filter(row => {
  if (ids.has(row.id)) throw new Error(`Duplicate RAG id: ${row.id}`);
  ids.add(row.id);
  const duplicateKey = [row.document_title, row.chapter_title, row.section_title, row.checksum_sha256 || row.text].join('\u0000');
  if (duplicateKeys.has(duplicateKey)) return false;
  duplicateKeys.add(duplicateKey);
  return true;
});

const plaintext = Buffer.from(JSON.stringify(chunks), 'utf8');
const compressed = gzipSync(plaintext, { level: 9 });
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(compressed), cipher.final(), cipher.getAuthTag()]);
const payload = Buffer.concat([iv, encrypted]).toString('base64');
const checksum = createHash('sha256').update(plaintext).digest('hex');

const generated = `// Generated by scripts/build-rag-corpus.mjs. Do not edit by hand.\n` +
  `export const ${exportPrefix}_BASE64 = ${JSON.stringify(payload)};\n` +
  `export const ${exportPrefix}_METADATA = ${JSON.stringify({
    chunkCount: chunks.length,
    rawChunkCount: normalizedChunks.length,
    documentCount: new Set(chunks.map(chunk => chunk.document_title)).size,
    plaintextSha256: checksum,
    sourceRevisions: [...new Set(chunks.map(chunk => chunk.revision_basis).filter(Boolean))],
  })} as const;\n`;

writeFileSync(outputPath, generated, 'utf8');
console.log(`Encrypted ${chunks.length}/${normalizedChunks.length} unique chunks from ${inputPaths.length} sources -> ${outputPath}`);
