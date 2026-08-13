import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("반응형 타이포그래피", () => {
  it("데스크톱 메시지는 한글 단어 중간에서 줄바꿈하지 않는다", async () => {
    const css = await readFile(new URL("./global.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.desktop-story\s*>\s*h2\s*\{[^}]*word-break:\s*keep-all/s);
  });

  it("데스크톱 보조 패널의 긴 한글 문장이 그리드 폭을 밀어내지 않는다", async () => {
    const css = await readFile(new URL("./global.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.desktop-story\s*\{[^}]*min-width:\s*0/s);
  });
});
