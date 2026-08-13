import { describe, expect, it } from "vitest";

import { runDemoScenario } from "./scenario";

describe("심사 데모 백엔드 E2E", () => {
  it("마찰 질문부터 제보·독립 검증·다음 기사 안내·도움 피드백까지 연결한다", async () => {
    const result = await runDemoScenario();

    expect(result.question.statusCode).toBe(200);
    expect(result.question.body.question).toContain("불편한 점");
    expect(result.question.body.choices).toContain("불편하지 않았어요");
    expect(result.report.statusCode).toBe(201);
    expect(result.report.body.awardedPoints).toBe(10);
    expect(result.pending.body.pendingConfirmation.text).toContain("후문");
    expect(result.confirm.body.status).toBe("VERIFIED");
    expect(result.guide.body.items[0].text).toContain("후문");
    expect(result.helpful.body.helpfulCount).toBe(1);
    expect(result.reporterPointBalance).toBe(35);
    expect(result.persistedData).not.toContain("010-1234-5678");
  });
});
