import { describe, expect, test } from "bun:test";
import { TRIAGE_SYSTEM_PROMPT, validate, parseJson } from "../src/decide/triage.ts";
import { ACTION_REQUIRED_HINTS, WORKING_HINTS, QUEUED_HINTS } from "../src/types.ts";

describe("Triage Agent のプロンプトとバリデーション", () => {
  test("SYSTEM プロンプトに定義済みの全 display_hint が含まれていること", () => {
    for (const hint of ACTION_REQUIRED_HINTS) {
      expect(TRIAGE_SYSTEM_PROMPT).toContain(`"${hint}"`);
    }
    for (const hint of WORKING_HINTS) {
      expect(TRIAGE_SYSTEM_PROMPT).toContain(`"${hint}"`);
    }
    for (const hint of QUEUED_HINTS) {
      expect(TRIAGE_SYSTEM_PROMPT).toContain(`"${hint}"`);
    }
  });

  test("validate: 正常な判定 JSON を通す", () => {
    const valid = {
      state: "ActionRequired",
      display_hint: "仕様確認待ち",
      next_job: "none",
      job_context: "",
      reason: "スコープの確認が必要",
    };
    expect(validate(valid)).toBeNull();

    const queuedWithJob = {
      state: "Queued",
      display_hint: "着手待ち",
      next_job: "refine",
      job_context: "要件を整理してください",
      reason: "新しい指示があるため",
    };
    expect(validate(queuedWithJob)).toBeNull();

    const done = {
      state: "Done",
      display_hint: "",
      next_job: "none",
      job_context: "",
      reason: "完了",
    };
    expect(validate(done)).toBeNull();
  });

  test("validate: 自由形式や英語の display_hint を拒否する", () => {
    const invalidHint = {
      state: "ActionRequired",
      display_hint: "Scope clarification needed",
      next_job: "none",
      job_context: "",
      reason: "スコープの確認が必要",
    };
    expect(validate(invalidHint)).toBe("bad display_hint: Scope clarification needed");
  });

  test("validate: state と display_hint の不一致を拒否する", () => {
    const mismatch = {
      state: "Working",
      display_hint: "仕様確認待ち",
      next_job: "none",
      job_context: "",
      reason: "不一致テスト",
    };
    expect(validate(mismatch)).toBe("hint does not match state: Working / 仕様確認待ち");
  });

  test("validate: ActionRequired のまま next_job を積むのを拒否する", () => {
    const invalidJob = {
      state: "ActionRequired",
      display_hint: "仕様確認待ち",
      next_job: "implement",
      job_context: "実装してください",
      reason: "不正な組み合わせ",
    };
    expect(validate(invalidJob)).toBe("next_job set while ActionRequired");
  });

  test("parseJson: Markdown や前後のノイズがあっても JSON を抽出できる", () => {
    const output = `
思考プロセス:
スコープが曖昧なので仕様確認待ちにします。

\`\`\`json
{
  "state": "ActionRequired",
  "display_hint": "仕様確認待ち",
  "next_job": "none",
  "job_context": "",
  "reason": "スコープ確認が必要"
}
\`\`\`
以上です。
`;
    const parsed = parseJson(output);
    expect(parsed).not.toBeNull();
    expect(parsed?.state).toBe("ActionRequired");
    expect(parsed?.display_hint).toBe("仕様確認待ち");
  });
});
