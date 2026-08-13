import { runDemoScenario } from "./scenario";

const result = await runDemoScenario();
const expectedStatuses = [
  result.friction.statusCode,
  result.question.statusCode,
  result.report.statusCode,
  result.pending.statusCode,
  result.confirm.statusCode,
  result.guide.statusCode,
  result.helpful.statusCode,
];

if (expectedStatuses.some((status) => status < 200 || status >= 300)) {
  throw new Error(`데모 E2E 실패: HTTP ${expectedStatuses.join(", ")}`);
}

console.log(
  JSON.stringify(
    {
      scenario: "합성 데이터 기반 심사 데모",
      frictionDecision: result.friction.body,
      questions: result.question.body.questions,
      initialPoints: result.report.body.awardedPoints,
      candidate: result.pending.body.pendingConfirmation,
      verifiedStatus: result.confirm.body.status,
      nextDriverGuide: result.guide.body.items,
      helpfulCount: result.helpful.body.helpfulCount,
      finalReporterPoints: result.reporterPointBalance,
      rawPhonePersisted: result.persistedData.includes("010-1234-5678"),
    },
    null,
    2,
  ),
);
