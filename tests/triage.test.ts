import { describe, expect, test } from "bun:test";
import {
  normalizeTriageOutput,
  parseJson,
  TRIAGE_SYSTEM_PROMPT,
  validate,
} from "../src/decide/triage.ts";
import { ACTION_REQUIRED_HINTS, WORKING_HINTS } from "../src/types.ts";

describe("Triage Agent のプロンプトとバリデーション", () => {
  test("SYSTEM プロンプトに定義済みの全 display_hint が含まれていること", () => {
    for (const hint of ACTION_REQUIRED_HINTS) {
      expect(TRIAGE_SYSTEM_PROMPT).toContain(`"${hint}"`);
    }
    for (const hint of WORKING_HINTS) {
      expect(TRIAGE_SYSTEM_PROMPT).toContain(`"${hint}"`);
    }
  });

  test("validate: 正常な判定 JSON を通す", () => {
    const valid = {
      display_hint: "仕様確認待ち",
      next_job: "none",
      job_context: "",
      reason: "スコープの確認が必要",
    };
    expect(validate(valid)).toBeNull();

    const queuedWithJob = {
      display_hint: "着手待ち",
      next_job: "refine",
      job_context: "要件を整理してください",
      reason: "新しい指示があるため",
    };
    expect(validate(queuedWithJob)).toBeNull();

    const done = {
      display_hint: "",
      next_job: "none",
      job_context: "",
      reason: "完了",
    };
    expect(validate(done)).toBeNull();
  });

  test("validate: 自由形式や英語の display_hint を拒否する", () => {
    const invalidHint = {
      display_hint: "Scope clarification needed",
      next_job: "none",
      job_context: "",
      reason: "スコープの確認が必要",
    };
    expect(validate(invalidHint)).toBe("bad display_hint: Scope clarification needed");
  });

  test("validate: next_job があるのに job_context が空なら拒否する", () => {
    const emptyCtx = {
      next_job: "implement",
      job_context: "",
      reason: "実装指示",
    };
    expect(validate(emptyCtx)).toBe("empty job_context");
  });

  test("normalizeTriageOutput: next_job がある場合は自動的に Queued / 着手待ち に正規化される", () => {
    // LLM が state: ActionRequired や display_hint: 仕様確認待ち を返してきても安全に補正
    const raw = {
      state: "ActionRequired",
      display_hint: "仕様確認待ち",
      next_job: "implement",
      job_context: "flake.nix を修正してください",
      reason: "レビュー指摘に対応するため",
    };
    const out = normalizeTriageOutput(raw);
    expect(out.state).toBe("Queued");
    expect(out.display_hint).toBe("着手待ち");
    expect(out.next_job).toBe("implement");
    expect(out.job_context).toBe("flake.nix を修正してください");
  });

  test("normalizeTriageOutput: next_job が none の場合は display_hint から state が一意に導出される", () => {
    const mergeWait = normalizeTriageOutput({
      display_hint: "マージ待ち",
      next_job: "none",
      reason: "CI合格",
    });
    expect(mergeWait.state).toBe("ActionRequired");
    expect(mergeWait.display_hint).toBe("マージ待ち");

    const ciWait = normalizeTriageOutput({
      display_hint: "CI 待ち",
      next_job: "none",
      reason: "CI実行中",
    });
    expect(ciWait.state).toBe("Working");
    expect(ciWait.display_hint).toBe("CI 待ち");

    const done = normalizeTriageOutput({
      display_hint: "",
      next_job: "none",
      reason: "完了",
    });
    expect(done.state).toBe("Done");
    expect(done.display_hint).toBe("");
  });

  test("parseJson: Markdown や前後のノイズがあっても JSON を抽出できる", () => {
    const output = `
思考プロセス:
スコープが曖昧なので仕様確認待ちにします。

\`\`\`json
{
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
    expect(parsed?.display_hint).toBe("仕様確認待ち");
  });

  test("buildPrompt: reviewThreads のインラインコメントがファイル位置付きで過去履歴に含まれる", () => {
    const { buildPrompt } = require("../src/decide/triage.ts");
    const prompt = buildPrompt({
      item: {
        repo: "o/r",
        issue_number: 1,
        pr_number: 10,
        state: "ActionRequired",
        display_hint: "仕様確認待ち",
        blocked_from: "",
        sub_issues_completed: 0,
        sub_issues_total: 0,
        retry_count: 0,
      },
      issue: {
        title: "Test Issue",
        body: "Issue Body",
        comments: { nodes: [] },
      },
      pr: {
        body: "PR Body",
        state: "OPEN",
        comments: { nodes: [] },
        reviews: {
          nodes: [
            {
              databaseId: 1,
              body: "全体のレビューコメント",
              submittedAt: "2026-08-24T00:50:00Z",
              author: { login: "reviewer" },
            },
          ],
        },
        reviewThreads: {
          nodes: [
            {
              isResolved: false,
              comments: {
                nodes: [
                  {
                    databaseId: 10,
                    body: "hostName は不要では？",
                    path: "nix/flake.nix",
                    line: 121,
                    createdAt: "2026-08-24T01:00:00Z",
                    author: { login: "reviewer" },
                  },
                ],
              },
            },
          ],
        },
      },
      newEvents: [
        {
          kind: "review_comment",
          author: "reviewer",
          body: "[nix/flake.nix:121] 修正して。",
          at: "2026-08-24T01:05:00Z",
        },
      ],
      lastRun: null,
    });

    expect(prompt).toContain("## 過去の履歴");
    expect(prompt).toContain("[nix/flake.nix:121] hostName は不要では？");
    expect(prompt).toContain("全体のレビューコメント");
    expect(prompt).toContain("[nix/flake.nix:121] 修正して。");
  });
});
