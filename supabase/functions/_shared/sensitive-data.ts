function isValidCardNumber(candidate: string) {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) {
    return false;
  }
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function hasKnownCardIssuerPrefix(digits: string) {
  const firstTwo = Number(digits.slice(0, 2));
  const firstThree = Number(digits.slice(0, 3));
  const firstFour = Number(digits.slice(0, 4));
  const firstSix = Number(digits.slice(0, 6));
  return digits.startsWith("4") ||
    (firstTwo >= 51 && firstTwo <= 55) ||
    (firstFour >= 2221 && firstFour <= 2720) ||
    ["34", "37", "36", "38", "39", "62", "65"].includes(digits.slice(0, 2)) ||
    digits.startsWith("6011") ||
    (firstThree >= 300 && firstThree <= 305) ||
    (firstThree >= 644 && firstThree <= 649) ||
    (firstFour >= 3528 && firstFour <= 3589) ||
    (firstSix >= 622126 && firstSix <= 622925);
}

function containsCardNumber(value: string) {
  const matches = [
    ...value.matchAll(/(?<!\d)\d{13,19}(?!\d)/g),
    ...value.matchAll(/(?<!\d)\d{4}([ -])\d{4,6}(?:\1\d{4,5}){1,2}(?!\d)/g),
  ];
  return matches.some((match) => {
    if (!isValidCardNumber(match[0])) return false;
    const digits = match[0].replace(/\D/g, "");
    const start = Math.max(0, Number(match.index) - 32);
    const end = Math.min(
      value.length,
      Number(match.index) + match[0].length + 32,
    );
    const context = value.slice(start, end);
    return hasKnownCardIssuerPrefix(digits) ||
      /(?:카드|신용|체크|결제|유효\s*기간|CVC|CVV|card)/i.test(context);
  });
}

export function detectSensitiveData(value: string) {
  const detected = new Set<string>();
  if (/\b\d{6}\s*[- ]?\s*[1-8]\d{6}\b/.test(value)) {
    detected.add("주민·외국인등록번호");
  }
  if (/\b01[016789](?:[-.\s]?\d){7,8}\b/.test(value)) {
    detected.add("휴대전화번호");
  }
  if (/\b[MSROD]\d{8}\b/i.test(value)) detected.add("여권번호");
  if (/계좌(?:\s*번호)?\s*[:：]?\s*\d(?:[-\s]?\d){8,15}/.test(value)) {
    detected.add("계좌번호");
  }
  if (containsCardNumber(value)) detected.add("카드번호");
  return [...detected];
}
