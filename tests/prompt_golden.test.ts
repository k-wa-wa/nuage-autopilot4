// プロンプトの golden テスト。
//
// 出力そのものを testdata/*.golden に固定し、テンプレートを触ったときに
// 意図しない差分が出ていないかを見る。更新は UPDATE_GOLDEN=1 で行う。

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPrompt as buildTriagePrompt, type TriageInput } from "../src/decide/triage.ts";
import { buildPrompt as buildWorkerPrompt, type PromptInput } from "../src/execute/prompt.ts";
import type { IssueDetail, PrDetail } from "../src/github/detail.ts";
import type { Item } from "../src/types.ts";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "testdata");

function golden(name: string, actual: string): void {
  const path = join(DIR, `${name}.golden`);
  if (process.env.UPDATE_GOLDEN === "1" || !existsSync(path)) {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(path, actual, "utf8");
    return;
  }
  const expected = readFileSync(path, "utf8");
  expect(actual).toBe(expected);
}

function workerInput(patch: Partial<PromptInput> = {}): PromptInput {
  return {
    jobType: "refine",
    repo: "k-wa-wa/example-repo",
    issueNumber: 42,
    issueTitle: "ホストごとの自動アップグレード設定を追加したい",
    jobContext: "",
    resultPath: "/var/lib/autopilot/run/42.result.json",
    baseBranch: "master",
    prNumber: 0,
    gate: null,
    ...patch,
  };
}

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

describe("Worker Agent プロンプトの Golden テスト", () => {
  test("refine: 要求の精緻化プロンプト", () => {
    golden("refine", buildWorkerPrompt(workerInput({ jobType: "refine" })));
  });

  test("implement: 新規ブランチ・PR 作成の実装プロンプト", () => {
    golden(
      "implement_new",
      buildWorkerPrompt(
        workerInput({
          jobType: "implement",
          prNumber: 0,
          jobContext: "Issue 本文の仕様に従って実装し、nix flake check で検証してください。",
        }),
      ),
    );
  });

  test("implement: 既存 PR に対する修正実装プロンプト", () => {
    golden(
      "implement_existing_pr",
      buildWorkerPrompt(
        workerInput({
          jobType: "implement",
          prNumber: 43,
          jobContext:
            "PR #43 の nix/flake.nix:121 行でのレビュー指摘「hostNameは不要では」に対応してください。",
        }),
      ),
    );
  });

  test("evaluate: カスタム品質ゲートありの品質評価プロンプト", () => {
    golden(
      "evaluate_with_gate",
      buildWorkerPrompt(
        workerInput({
          jobType: "evaluate",
          prNumber: 43,
          gate: "## 品質基準\n- `nix flake check ./nix` が成功すること\n- 全ホストの時刻重複がないこと",
          jobContext: "CI が通過した。PR #43 を評価する。",
        }),
      ),
    );
  });

  test("evaluate: 品質ゲートなし（デフォルト基準）の品質評価プロンプト", () => {
    golden(
      "evaluate_no_gate",
      buildWorkerPrompt(
        workerInput({
          jobType: "evaluate",
          prNumber: 43,
          gate: null,
          jobContext: "CI が通過した。PR #43 を評価する。",
        }),
      ),
    );
  });
});

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
});
