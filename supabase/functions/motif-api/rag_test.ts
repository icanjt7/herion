import {
  applyRagOverrides,
  buildRagUnavailableContext,
  expandRagQueryText,
  extractNamedRuleTerms,
  formatRagTableForContext,
  isInternalGuidanceQuestion,
  isStructuredInternalDataQuestion,
  isTravelExpenseQuestion,
  isTravelExpenseNonPaymentQuestion,
  namedRuleTitleBoost,
  normalizeTravelExpenseQuery,
  requestedTravelExpenseComponents,
  travelExpenseTableBoost,
  unitTypeQueryBoost,
} from './rag.ts';

const baseChunk = {
  id: 'base-1', document_title: '복무 편람', chapter_title: '출장', section_title: '여비',
  text: '원문', collection: 'rules', source_file: 'handbook.md', revision_basis: '2026.05.01.',
  source_line_start: 1, source_line_end: 2, checksum_sha256: 'base-checksum',
};

Deno.test('admin override replaces, disables, and extends the registered corpus', () => {
  const common = {
    id: 'override-1', base_chunk_id: 'base-1', document_title: '복무 편람', chapter_title: '출장',
    section_title: '여비', text: '관리자 수정문', collection: 'rules', source_file: 'handbook.md',
    revision_basis: '2026.08.03.', source_line_start: 1, source_line_end: 2, unit_type: null,
    related_regulations: [], department: null, is_active: true, updated_at: '2026-08-03T00:00:00Z',
    updated_by_email: 'admin@kh.or.kr',
  };
  const replaced = applyRagOverrides([baseChunk], [common]);
  if (replaced.length !== 1 || replaced[0].text !== '관리자 수정문') throw new Error('override was not applied');
  const disabled = applyRagOverrides([baseChunk], [{ ...common, is_active: false }]);
  if (disabled.length !== 0) throw new Error('disabled base chunk remained searchable');
  const custom = applyRagOverrides([baseChunk], [{ ...common, id: 'custom-1', base_chunk_id: null }]);
  if (custom.length !== 2 || !custom.some((chunk) => chunk.id === 'custom:custom-1')) throw new Error('custom chunk missing');
});

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

Deno.test('extracts named internal guidance with or without spacing', () => {
  assertEquals(extractNamedRuleTerms('일상감사지침 대상업무인지 다시 검토해줘'), ['일상감사지침']);
  assertEquals(extractNamedRuleTerms('일상감사 지침에 따라 검토해줘'), ['일상감사지침']);
  assertEquals(extractNamedRuleTerms('복무 편람에서 연차 사용을 찾아줘'), ['복무편람']);
  assertEquals(extractNamedRuleTerms('실장 여비기준'), []);
});

Deno.test('strongly boosts the explicitly named internal guidance', () => {
  const query = '용역 계약체결이 일상감사지침 대상업무인지 검토해줘';
  assertEquals(namedRuleTitleBoost('국가유산진흥원 일상감사 지침', query), 80);
  assertEquals(namedRuleTitleBoost('계약업무 처리규정', query), 0);
});

Deno.test('strongly boosts an explicitly named handbook', () => {
  const query = '국가유산진흥원 복무 편람에서 유연근무제 신청 절차를 찾아줘';
  assertEquals(namedRuleTitleBoost('국가유산진흥원 복무 편람(2026.05.01.)', query), 80);
});

Deno.test('boosts handbook Q&A and form chunks for matching request styles', () => {
  assertEquals(unitTypeQueryBoost('qa', '육아휴직은 언제 신청할 수 있나요?'), 9);
  assertEquals(unitTypeQueryBoost('form', '유연근무제 신청서 양식을 찾아줘'), 11);
  assertEquals(unitTypeQueryBoost('body', '유연근무제 신청 절차를 알려줘'), 0);
  assertEquals(unitTypeQueryBoost('qa', '출장비를 못 받는 경우가 있나?'), 0);
});

Deno.test('expands broad travel expense non-payment questions with every explicit restriction', () => {
  const query = '근무지내 출장시 출장비를 못 받는 경우가 있나?';
  assertEquals(isTravelExpenseNonPaymentQuestion(query), true);
  const expanded = expandRagQueryText(query);
  assertEquals(expanded.includes('운전업무 담당 직원'), true);
  assertEquals(expanded.includes('편도 1km 이내'), true);
  assertEquals(expanded.includes('출장 처리 필수'), true);
  assertEquals(expandRagQueryText('근무지내 출장의 정의를 알려줘'), '근무지내 출장의 정의를 알려줘');
});

Deno.test('normalizes and expands compact position-based travel expense questions', () => {
  const query = '실장 여비기준';
  assertEquals(isTravelExpenseQuestion(query), true);
  assertEquals(normalizeTravelExpenseQuery(query), '실장 여비 기준');
  const expanded = expandRagQueryText(query);
  assertEquals(expanded.includes('국내출장 국외출장'), true);
  assertEquals(expanded.includes('운임 교통비 숙박비 식비 일비'), true);
  assertEquals(expanded.includes('직위 직급 여비 등급'), true);
});

Deno.test('guards travel expense answers when internal evidence is unavailable', () => {
  const context = buildRagUnavailableContext('실장 여비기준', 'no_match');
  assertEquals(context.includes('내부 여비 근거를 찾지 못했다'), true);
  assertEquals(context.includes('법령번호'), true);
  assertEquals(context.includes('직책만으로 여비 등급을 임의 결정하지 않는다'), true);
  assertEquals(buildRagUnavailableContext('행사 안내문 작성', 'error'), '');
});

Deno.test('keeps per-diem questions focused on per-diem evidence', () => {
  const query = '출장시 일비 안내';
  assertEquals(isTravelExpenseQuestion(query), true);
  assertEquals(isTravelExpenseQuestion('일비 안내'), true);
  assertEquals(requestedTravelExpenseComponents(query), ['일비']);
  const expanded = expandRagQueryText(query);
  assertEquals(expanded.includes('일비 지급액 정액 하루 1일 감액 제외'), true);
  assertEquals(expanded.includes('국내여비 지급 기준표 국외여비 지급 기준표'), true);
  assertEquals(expanded.includes('교통비 숙박비 식비 일비'), false);
});

Deno.test('boosts retrieved travel payment tables without inventing missing components', () => {
  const tableChunk = {
    ...baseChunk,
    document_title: '국가유산진흥원 복무 편람',
    section_title: '국내여비 지급 기준표',
    text: '구분 철도운임 일비 숙박비 식비 원장 25,000',
  };
  assertEquals(travelExpenseTableBoost(tableChunk, ['일비']), 32);
  assertEquals(travelExpenseTableBoost(tableChunk, ['교통비']), 0);
  assertEquals(travelExpenseTableBoost({ ...tableChunk, section_title: '일비 감액', text: '일비 1/2 지급' }, ['일비']), 0);
  assertEquals(travelExpenseTableBoost({ ...tableChunk, section_title: '제13조', text: '일비는 별표 1에 따라 지급한다' }, ['일비']), 0);
});

Deno.test('formats structured table matrices and preserves expanded merged-cell values', () => {
  const markdown = formatRagTableForContext({
    id: 'KHT-test',
    document_title: '국가유산진흥원 복무 편람',
    source_file: 'handbook.pdf',
    revision_basis: '2026-01-01',
    page_start: 113,
    page_end: 113,
    table_index: 1,
    table_title: '국내여비 지급 기준표',
    table_type: 'data_table',
    row_count: 3,
    column_count: 2,
    expanded_matrix: [['구분', '일비'], ['본부장', '25,000'], ['팀장, 팀원', '25,000']],
    markdown: '| 구분 | 일비 |\n| --- | --- |\n| 본부장 | 25,000 |\n| 팀장, 팀원 | 25,000 |',
    search_text: '국내여비 지급 기준표 본부장 팀장 팀원 일비 25,000',
    confidence: 0.95,
    score: 20,
  }, ['일비']);
  assertEquals(markdown.includes('| 본부장 | 25,000 |'), true);
  assertEquals(markdown.includes('| 팀장, 팀원 | 25,000 |'), true);
});

Deno.test('recognizes internal guidance questions across business domains', () => {
  assertEquals(isInternalGuidanceQuestion('일상감사지침 대상업무를 알려줘'), true);
  assertEquals(isInternalGuidanceQuestion('수의계약 기준과 절차'), true);
  assertEquals(isInternalGuidanceQuestion('연차 신청은 언제 가능해?'), true);
  assertEquals(isInternalGuidanceQuestion('행사 안내문 작성'), false);
});

Deno.test('recognizes internal questions that require structured table data', () => {
  assertEquals(isStructuredInternalDataQuestion('직원 근무시간 표로 알려줘'), true);
  assertEquals(isStructuredInternalDataQuestion('여비규정 별표 1 금액'), true);
  assertEquals(isStructuredInternalDataQuestion('행사 일정표를 만들어줘'), false);
});

Deno.test('guards every internal guidance answer when evidence is unavailable', () => {
  const context = buildRagUnavailableContext('수의계약 기준과 절차', 'no_match');
  assertEquals(context.includes('내부 규정·지침 검색 상태'), true);
  assertEquals(context.includes('내부 문서명, 조항, 별표'), true);
  assertEquals(context.includes('다른 기관의 일반 기준'), true);
});
