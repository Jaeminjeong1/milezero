import type { PiiType } from "@/domain/contracts";

type SanitizationRule = {
  type: PiiType;
  pattern: RegExp;
  replacement: string;
};

const rules: SanitizationRule[] = [
  {
    type: "NAME",
    pattern:
      /(?:수령인|받는\s*분|고객|담당자)\s*(?:이름)?\s*[:은는]?\s*[가-힣]{2,4}/g,
    replacement: "[이름 제거]",
  },
  {
    type: "RESIDENT_ID",
    pattern: /\b\d{6}[-\s]?[1-4]\d{6}\b/g,
    replacement: "[주민번호 제거]",
  },
  {
    type: "ACCOUNT",
    pattern:
      /(?:계좌번호|계좌)\s*[:은는]?\s*\d{2,6}(?:-\d{2,6}){2,4}/g,
    replacement: "[계좌번호 제거]",
  },
  {
    type: "PHONE",
    pattern: /(?:\+82[-.\s]?)?0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g,
    replacement: "[전화번호 제거]",
  },
  {
    type: "EMAIL",
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    replacement: "[이메일 제거]",
  },
  {
    type: "UNIT",
    pattern: /\d{1,4}\s*동\s*\d{1,4}\s*호/g,
    replacement: "[동호수 제거]",
  },
  {
    type: "PASSWORD",
    pattern:
      /(?:공동현관\s*)?(?:비밀번호|비번|출입\s*번호)\s*[:은는]?\s*[A-Z0-9#*]{3,12}/gi,
    replacement: "[출입 비밀번호 제거]",
  },
  {
    type: "PLATE",
    pattern: /\d{2,3}[가-힣]\s*\d{4}/g,
    replacement: "[차량번호 제거]",
  },
];

export function sanitizeText(input: string): {
  text: string;
  removedPiiTypes: PiiType[];
} {
  let text = input;
  const removedPiiTypes: PiiType[] = [];

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) {
      removedPiiTypes.push(rule.type);
      rule.pattern.lastIndex = 0;
      text = text.replace(rule.pattern, rule.replacement);
    }
  }

  return { text, removedPiiTypes };
}
