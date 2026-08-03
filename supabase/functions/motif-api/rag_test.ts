import { extractNamedRuleTerms, namedRuleTitleBoost, unitTypeQueryBoost } from './rag.ts';

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
});
