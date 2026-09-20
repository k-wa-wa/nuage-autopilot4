import { describe, expect, test } from "bun:test";
import { goldenIn } from "../testing/golden.ts";
import { buildPrompt as buildWorkerPrompt, type PromptInput } from "./prompt.ts";

const golden = goldenIn(import.meta.url);

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

describe("プロンプトの境界条件", () => {
  test("worker: 品質ゲートが空文字でも既定文言に置き換えず、そのまま出す", () => {
    const p = buildWorkerPrompt(workerInput({ jobType: "evaluate", prNumber: 43, gate: "" }));
    expect(p.endsWith("## このリポジトリの品質ゲート\n")).toBe(true);
  });

  test("worker: 品質ゲートの末尾改行は保つ", () => {
    const p = buildWorkerPrompt(workerInput({ jobType: "evaluate", prNumber: 43, gate: "基準\n" }));
    expect(p.endsWith("## このリポジトリの品質ゲート\n基準\n")).toBe(true);
  });

  test("worker: 引き継ぎ文脈は前後の空白を除いて出す。空白のみなら節ごと出さない", () => {
    const withCtx = buildWorkerPrompt(workerInput({ jobContext: "\n  指示  \n\n" }));
    expect(withCtx).toContain("## 引き継がれた指示・文脈\n指示\n\n## このリポジトリの品質ゲート");
    const blank = buildWorkerPrompt(workerInput({ jobContext: " \n " }));
    expect(blank).not.toContain("引き継がれた指示");
  });

  test("値に含まれる {{ }} や $ はそのまま出る（第三者テキストの混入）", () => {
    const p = buildWorkerPrompt(
      workerInput({ issueTitle: "{{#if x}}{{repo}}{{/if}} $& $1", jobContext: "{{> rules}}" }),
    );
    expect(p).toContain("対象 Issue: #42 {{#if x}}{{repo}}{{/if}} $& $1");
    expect(p).toContain("{{> rules}}");
  });
});
