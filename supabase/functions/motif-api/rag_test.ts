import {
  applyRagOverrides,
  expandRagQueryText,
  extractNamedRuleTerms,
  isTravelExpenseNonPaymentQuestion,
  namedRuleTitleBoost,
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
