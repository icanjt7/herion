import { detectSensitiveData } from "./sensitive-data.ts";

function assertDetected(value: string, expected: boolean) {
  const actual = detectSensitiveData(value).includes("카드번호");
  if (actual !== expected) {
    throw new Error(
      `expected card detection=${expected}, got ${actual}: ${value}`,
    );
  }
}

Deno.test("업무 문서의 분리된 연도·성과 수치를 카드번호로 합치지 않는다", () => {
  assertDetected("2026 1 2 3 4 5 6 7 8 9 0 1 2 3 주요 업무성과", false);
  assertDetected("사업관리번호 1234567890123452", false);
});

Deno.test("발급사 대역과 Luhn 검사를 통과한 카드번호를 탐지한다", () => {
  assertDetected("4111 1111 1111 1111", true);
  assertDetected("5555555555554444", true);
});

Deno.test("카드 문맥이 있으면 국내·기타 발급사 번호도 탐지한다", () => {
  assertDetected("카드번호: 1234567890123452", true);
});

Deno.test("Luhn 검사를 통과하지 못하면 카드 문맥에서도 탐지하지 않는다", () => {
  assertDetected("카드번호: 4111 1111 1111 1112", false);
});
