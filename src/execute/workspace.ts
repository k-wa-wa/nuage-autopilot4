import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Config } from "../config.ts";
import { chatWorkspaceDir, workspaceDir } from "../config.ts";
import type { JobType } from "../types.ts";

/**
 * ワークスペース（spec.md §8）。
 * リポジトリごとに固定のクローンを 1 つだけ持つ。複数チェックアウトは行わない
 * （Git ワークツリーの単一性制約）。
 */

export type GitRunner = (
  args: string[],
  cwd: string,
) => Promise<{ code: number; stdout: string; stderr: string }>;

export const realGit: GitRunner = async (args, cwd) => {
  const p = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  return { code, stdout, stderr };
};

/**
 * 認証は実行時の GH_TOKEN から取る。
 * remote URL にトークンを埋め込むと .git/config に平文で残るため、
 * URL には一切載せずヘルパー経由にする。
 */
const CREDENTIAL_HELPER = '!f() { echo username=x-access-token; echo "password=$GH_TOKEN"; }; f';

/** 既存クローン（旧バージョンが作ったものを含む）にも毎回張り直す。 */
async function configureCredentials(dir: string, git: GitRunner): Promise<void> {
  await git(["config", "--local", "credential.helper", CREDENTIAL_HELPER], dir);
}

export function targetBranch(
  jobType: JobType,
  isNewPr: boolean,
  itemBranch: string,
  base: string,
): string {
  if (jobType === "evaluate") return itemBranch || base;
  if (jobType === "implement" && !isNewPr && itemBranch) return itemBranch;
  return base; // refine と implement（新規）は既定ブランチから始める
}

export async function ensureClone(
  cfg: Config,
  repo: string,
  git: GitRunner = realGit,
): Promise<string> {
  const dir = workspaceDir(cfg, repo);
  if (existsSync(`${dir}/.git`)) {
    await configureCredentials(dir, git);
    return dir;
  }
  mkdirSync(dirname(dir), { recursive: true });
  const url = `https://github.com/${repo}.git`;
  const r = await git(
    ["-c", `credential.helper=${CREDENTIAL_HELPER}`, "clone", url, dir],
    dirname(dir),
  );
  if (r.code !== 0) throw new Error(`clone failed: ${r.stderr}`);
  await configureCredentials(dir, git);
  return dir;
}

/** `owner/name` 形式か。パス区切りや `.` / `..` のセグメントを含むものは弾く。 */
export function isRepoSlug(repo: string): boolean {
  const parts = repo.split("/");
  return (
    parts.length === 2 && parts.every((p) => /^[A-Za-z0-9_.-]+$/.test(p) && p !== "." && p !== "..")
  );
}

/**
 * Autopilot Chat 専用の調査用ワークスペースを準備する。
 *
 * メインワーカー（workspaceDir）とは完全に分離された chatWorkspaceDir にクローンする。
 * これにより、メインワーカーのジョブ実行（ブランチ作成・コミット・リセット）との競合や破壊を防ぐ。
 *
 * - 未クローン: git clone（既定ブランチの最新になる）
 * - refresh（新しい会話の開始時）: fetch して既定ブランチの最新へ detached で合わせ、作業ツリーを空にする
 * - それ以外（会話の続き）: 触らない。会話の途中で読んでいたコードが変わらないようにする
 */
export async function ensureChatWorkspace(
  cfg: Config,
  repo: string,
  opts: { refresh: boolean },
  git: GitRunner = realGit,
): Promise<string> {
  // repo はブラウザから届く。`..` などでメインワーカーの workspaces/ を指されると reset/clean で壊れる
  if (!isRepoSlug(repo)) throw new Error(`invalid repo: ${repo}`);
  const dir = chatWorkspaceDir(cfg, repo);
  if (!existsSync(`${dir}/.git`)) {
    mkdirSync(dirname(dir), { recursive: true });
    const url = `https://github.com/${repo}.git`;
    const r = await git(
      ["-c", `credential.helper=${CREDENTIAL_HELPER}`, "clone", url, dir],
      dirname(dir),
    );
    if (r.code !== 0) throw new Error(`chat workspace clone failed: ${r.stderr}`);
    await configureCredentials(dir, git);
    return dir;
  }
  if (!opts.refresh) return dir;

  await configureCredentials(dir, git);
  const f = await git(["fetch", "--prune", "origin"], dir);
  if (f.code !== 0) throw new Error(`chat workspace fetch failed: ${f.stderr}`);
  // 既定ブランチが変わっていても追従する
  await git(["remote", "set-head", "origin", "--auto"], dir);
  // エージェントが途中で止めた操作が残っていると checkout しても状態が残る
  await git(["rebase", "--abort"], dir);
  await git(["merge", "--abort"], dir);
  await git(["cherry-pick", "--abort"], dir);
  // エージェントが別ブランチを checkout していても、そのブランチを動かさずに最新へ移る
  const c = await git(["checkout", "--detach", "--force", "origin/HEAD"], dir);
  if (c.code !== 0) throw new Error(`chat workspace checkout failed: ${c.stderr}`);
  await git(["clean", "-fdx"], dir);
  return dir;
}

/**
 * 実行直前の初期化。前回が SIGKILL された場合の残骸
 * （未コミット変更・未追跡ファイル・中断した rebase）を確実に除去する。
 *
 * --abort 群は || で連結せず独立に実行する。連結すると片方が成功した時点で
 * もう片方が実行されない。
 * clean に -x は付けない。node_modules 等の ignore 対象を残して再インストールを避ける。
 */
export async function prepare(
  dir: string,
  branch: string,
  git: GitRunner = realGit,
): Promise<void> {
  const must = async (args: string[]) => {
    const r = await git(args, dir);
    if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  };
  const may = async (args: string[]) => {
    await git(args, dir);
  };

  await must(["fetch", "--prune", "origin"]);
  await may(["rebase", "--abort"]);
  await may(["merge", "--abort"]);
  await may(["cherry-pick", "--abort"]);
  await must(["reset", "--hard", "HEAD"]);
  await must(["clean", "-fd"]);
  await must(["checkout", "-B", branch, `origin/${branch}`]);
  await must(["reset", "--hard", `origin/${branch}`]);
  await must(["clean", "-fd"]);
}

export async function headSha(dir: string, git: GitRunner = realGit): Promise<string> {
  const r = await git(["rev-parse", "HEAD"], dir);
  return r.code === 0 ? r.stdout.trim() : "";
}

/**
 * 品質ゲートは常に既定ブランチから読む。
 * 作業ブランチから読むと implement が基準そのものを緩められる。
 */
export async function readGate(
  dir: string,
  base: string,
  git: GitRunner = realGit,
): Promise<string | null> {
  const r = await git(["show", `origin/${base}:.agents/autopilot-gate.md`], dir);
  return r.code === 0 ? r.stdout : null;
}
