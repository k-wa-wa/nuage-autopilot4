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

/**
 * Autopilot Chat 専用の調査用ワークスペースを準備する。
 *
 * メインワーカー（workspaceDir）とは完全に分離された chatWorkspaceDir にクローンする。
 * これにより、メインワーカーのジョブ実行（ブランチ作成・コミット・リセット）との競合や破壊を防ぐ。
 *
 * - ディレクトリが存在しない場合: git clone を実行
 * - 既に存在する場合: git fetch --prune origin を行い、安全に HEAD または指定ブランチを clean 状態にする
 */
export async function ensureChatWorkspace(
  cfg: Config,
  repo: string,
  branch?: string,
  git: GitRunner = realGit,
): Promise<string> {
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
  } else {
    await configureCredentials(dir, git);
    await git(["fetch", "--prune", "origin"], dir);
  }

  // 調査エージェントが安全にファイルを読めるようクリーンアップ
  await git(["reset", "--hard", "HEAD"], dir);
  await git(["clean", "-fd"], dir);

  if (branch) {
    const r = await git(["checkout", branch], dir);
    if (r.code !== 0) {
      await git(["checkout", "-B", branch, `origin/${branch}`], dir);
    }
  }

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
