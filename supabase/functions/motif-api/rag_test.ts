import { extractNamedRuleTerms, namedRuleTitleBoost } from './rag.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

Deno.test('extracts named internal guidance with or without spacing', () => {
  assertEquals(extractNamedRuleTerms('일상감사지침 대상업무인지 다시 검토해줘'), ['일상감사지침']);
  assertEquals(extractNamedRuleTerms('일상감사 지침에 따라 검토해줘'), ['일상감사지침']);
});

Deno.test('strongly boosts the explicitly named internal guidance', () => {
  const query = '용역 계약체결이 일상감사지침 대상업무인지 검토해줘';
  assertEquals(namedRuleTitleBoost('국가유산진흥원 일상감사 지침', query), 80);
  assertEquals(namedRuleTitleBoost('계약업무 처리규정', query), 0);
});
