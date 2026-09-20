import { describe, expect, test } from "bun:test";
import type { IssueDetail, PrDetail } from "../github/detail.ts";
import { goldenIn } from "../testing/golden.ts";
import type { Item } from "../types.ts";
import { ACTION_REQUIRED_HINTS, WORKING_HINTS } from "../types.ts";
import {
  buildPrompt as buildTriagePrompt,
  normalizeTriageOutput,
  parseJson,
  TRIAGE_SYSTEM_PROMPT,
  type TriageInput,
  validate,
} from "./triage.ts";

const golden = goldenIn(import.meta.url);

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
    const { buildPrompt } = require("./triage.ts");
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

function baseItem(patch: Partial<Item> = {}): Item {
  return {
    repo: "k-wa-wa/example-repo",
    issue_number: 42,
    pr_number: 0,
    branch: "",
    head_sha: "",
    title: "ホストごとの自動アップグレード設定を追加したい",
    state: "ActionRequired",
    display_hint: "仕様確認待ち",
    state_since: "2026-08-28T16:00:00Z",
    blocked_from: "",
    last_event_at: "2026-08-28T16:00:00Z",
    last_event_id: 100,
    retry_count: 0,
    triage_fail_count: 0,
    recheck_needed: 0,
    ci_since: null,
    triaged: 1,
    parent_repo: "",
    parent_issue_number: 0,
    sub_issues_total: 0,
    sub_issues_completed: 0,
    version: 1,
    updated_at: "2026-08-28T16:00:00Z",
    ...patch,
  };
}

function baseIssue(patch: Partial<IssueDetail> = {}): IssueDetail {
  return {
    __typename: "Issue",
    id: "I_1",
    number: 42,
    title: "ホストごとの自動アップグレード設定を追加したい",
    body: "ホストごとに nixos-upgrade の自動適用を有効化・時刻設定できるようにする。",
    state: "OPEN",
    stateReason: null,
    updatedAt: "2026-08-28T16:00:00Z",
    author: { login: "k-wa-wa" },
    parent: null,
    subIssuesSummary: { total: 0, completed: 0, percentCompleted: 0 },
    subIssues: { totalCount: 0, pageInfo: { hasNextPage: false }, nodes: [] },
    comments: { nodes: [] },
    timelineItems: { nodes: [] },
    ...patch,
  };
}

function basePr(patch: Partial<PrDetail> = {}): PrDetail {
  return {
    __typename: "PullRequest",
    id: "PR_1",
    number: 43,
    title: "feat: ホスト別 autoUpgrade スケジュール対応",
    body: "ホスト別スケジュールの実装です。\n\nCloses #42",
    state: "OPEN",
    merged: false,
    isDraft: false,
    updatedAt: "2026-08-28T16:30:00Z",
    headRefName: "feat/issue-42-auto-upgrade",
    headRefOid: "8934470b7bb5ee5a5cb4080751d6f321a1361c23",
    baseRefName: "master",
    author: { login: "bot-wa-wa" },
    commits: {
      nodes: [
        {
          commit: {
            oid: "8934470b7bb5ee5a5cb4080751d6f321a1361c23",
            statusCheckRollup: { state: "SUCCESS" },
          },
        },
      ],
    },
    comments: { nodes: [] },
    reviews: { nodes: [] },
    reviewThreads: { nodes: [] },
    ...patch,
  };
}

describe("Triage Agent プロンプトの Golden テスト", () => {
  test("triage: 新規 Issue 起票時の判定プロンプト", () => {
    const input: TriageInput = {
      item: baseItem(),
      issue: baseIssue(),
      pr: null,
      newEvents: [
        { kind: "comment", author: "k-wa-wa", body: "進めてください", at: "2026-08-28T16:05:00Z" },
      ],
      lastRun: null,
    };
    golden("triage_issue_new", buildTriagePrompt(input));
  });

  test("triage: インラインコメント・スレッド履歴を含むレビュー指摘時の判定プロンプト", () => {
    const input: TriageInput = {
      item: baseItem({ pr_number: 43, branch: "feat/issue-42-auto-upgrade" }),
      issue: baseIssue(),
      pr: basePr({
        reviews: {
          nodes: [
            {
              databaseId: 201,
              state: "COMMENTED",
              body: "全体的に良いですが一部修正をお願いします。",
              submittedAt: "2026-08-28T16:45:00Z",
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
                    databaseId: 301,
                    body: "ここでは hostName は不要では？",
                    path: "nix/flake.nix",
                    line: 121,
                    createdAt: "2026-08-28T16:48:00Z",
                    author: { login: "reviewer" },
                  },
                ],
              },
            },
          ],
        },
      }),
      newEvents: [
        {
          kind: "review_comment",
          author: "reviewer",
          body: "[nix/flake.nix:121] 修正して。",
          at: "2026-08-28T17:00:00Z",
        },
      ],
      lastRun: {
        id: 1,
        job_id: 1,
        repo: "k-wa-wa/example-repo",
        issue_number: 42,
        job_type: "evaluate",
        started_at: "2026-08-28T16:35:00Z",
        ended_at: "2026-08-28T16:39:00Z",
        result: "SUCCESS",
        summary: "品質評価に合格し、マージ待ちとしました。",
        next_context: "",
        log_path: "/var/lib/autopilot/logs/1.log",
      },
    };
    golden("triage_pr_review_threads", buildTriagePrompt(input));
  });

  test("triage: 直前ジョブが blocked（助言待ち）だった場合の判定プロンプト", () => {
    const input: TriageInput = {
      item: baseItem({
        display_hint: "助言待ち",
        blocked_from: "implement",
      }),
      issue: baseIssue({
        comments: {
          nodes: [
            {
              databaseId: 105,
              body: "依存パッケージ X の型エラーでスタックしました。\n- 案1: パッケージ X を v2 にアップグレードする\n- 案2: 型定義を一旦 any でキャストして回避する\n👉 「1」または「2」で返信してください（推奨: 1）。",
              createdAt: "2026-08-28T16:10:00Z",
              author: { login: "bot-wa-wa" },
            },
          ],
        },
      }),
      pr: null,
      newEvents: [
        {
          kind: "comment",
          author: "k-wa-wa",
          body: "1 でお願いします",
          at: "2026-08-28T16:15:00Z",
        },
      ],
      lastRun: {
        id: 2,
        job_id: 2,
        repo: "k-wa-wa/example-repo",
        issue_number: 42,
        job_type: "implement",
        started_at: "2026-08-28T16:08:00Z",
        ended_at: "2026-08-28T16:10:00Z",
        result: "BLOCKED",
        summary: "パッケージ依存関係のエラーで人間の助言待ちとしました。",
        next_context: "案1または案2の選択肢を提示",
        log_path: "/var/lib/autopilot/logs/2.log",
      },
    };
    golden("triage_blocked_resume", buildTriagePrompt(input));
  });

  test("triage: 任意項目がすべて欠けている場合（PR 無し・履歴無し・新規イベント無し・本文なし）", () => {
    const input: TriageInput = {
      item: baseItem({ display_hint: "", blocked_from: "", state: "Queued" }),
      issue: baseIssue({ body: undefined }),
      pr: null,
      newEvents: [],
      lastRun: null,
    };
    golden("triage_minimal", buildTriagePrompt(input));
  });

  test("triage: PR 本文が空でも PR セクションは出す / 直前ジョブの summary・next_context が空なら行を出さない", () => {
    const input: TriageInput = {
      item: baseItem({ pr_number: 43 }),
      issue: baseIssue(),
      pr: basePr({ body: "", state: "MERGED" }),
      newEvents: [],
      lastRun: {
        id: 3,
        job_id: 3,
        repo: "k-wa-wa/example-repo",
        issue_number: 42,
        job_type: "implement",
        started_at: "2026-08-28T16:08:00Z",
        ended_at: "2026-08-28T16:10:00Z",
        result: null,
        summary: "",
        next_context: "",
        log_path: "/var/lib/autopilot/logs/3.log",
      },
    };
    golden("triage_empty_pr_body", buildTriagePrompt(input));
  });

  test("triage: 過去の履歴は直近 10 件だけ、古い順に並ぶ", () => {
    const input: TriageInput = {
      item: baseItem(),
      issue: baseIssue({
        comments: {
          nodes: Array.from({ length: 12 }, (_, n) => ({
            databaseId: 500 + n,
            body: `コメント ${n + 1}`,
            createdAt: `2026-08-28T16:${String(10 + n).padStart(2, "0")}:00Z`,
            author: { login: n % 2 === 0 ? "k-wa-wa" : "bot-wa-wa" },
          })),
        },
      }),
      pr: null,
      newEvents: [],
      lastRun: null,
    };
    golden("triage_history_limit", buildTriagePrompt(input));
  });

  test("triage: 本文・履歴は長ければ切り詰められる", () => {
    const long = "あ".repeat(5000);
    const p = buildTriagePrompt({
      item: baseItem({ pr_number: 43 }),
      issue: baseIssue({
        body: long,
        comments: {
          nodes: [
            {
              databaseId: 1,
              body: long,
              createdAt: "2026-08-28T16:10:00Z",
              author: { login: "k-wa-wa" },
            },
          ],
        },
      }),
      pr: basePr({ body: long }),
      newEvents: [],
      lastRun: null,
    });
    // Issue 本文・PR 本文は 4000 文字、履歴は 1000 文字で切る。
    expect(p.split("あ".repeat(4000) + "\n…（省略）").length - 1).toBe(2);
    expect(p).toContain("あ".repeat(1000) + "\n…（省略）");
    expect(p).not.toContain("あ".repeat(4001));
  });
});
