import type { Config } from "../config.ts";
import { repoSlug } from "../config.ts";
import type { GitHubClient } from "../github/client.ts";
import { resolveAdapter } from "../execute/adapters.ts";

/**
 * 起動時検証（spec.md）。
 * 設定ミスの多くは「実行時になって初めて失敗する」。doctor はそれを起動前に潰す。
 * autopilot run も起動時に同じ検証を通す。
 */

export interface Check {
  name: string;
  level: "ok" | "warn" | "fatal";
  detail: string;
}

const REPO_QUERY = `
query Doctor($owner: String!, $repo: String!, $gate: String!, $wf: String!) {
  rateLimit { cost remaining resetAt }
  repository(owner: $owner, name: $repo) {
    isPrivate
    viewerPermission
    defaultBranchRef { name }
    gate: object(expression: $gate) { __typename }
    workflows: object(expression: $wf) { __typename }
  }
}`;

const SUBISSUE_QUERY = `
query SubIssueProbe($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    issues(first: 1) { nodes { parent { number } subIssuesSummary { total } } }
  }
}`;

export async function doctor(cfg: Config, gh: GitHubClient): Promise<Check[]> {
  const checks: Check[] = [];

  // bot アカウントの取り違え。人間のトークンで動かすと自己トリガーの無限ループになる。
  let bot = "";
  try {
    bot = await gh.viewerLogin();
    checks.push(
      cfg.allowlist.includes(bot)
        ? { name: "bot account", level: "fatal", detail: `GH_TOKEN の所有者 ${bot} が allowlist に含まれている。専用 bot アカウントのトークンを使うこと（自己トリガーの無限ループになる）` }
        : { name: "bot account", level: "ok", detail: `bot = ${bot}` },
    );
  } catch (e) {
    checks.push({ name: "bot account", level: "fatal", detail: `viewer の取得に失敗: ${String(e)}` });
    return checks;
  }

  // エージェント CLI が起動できること。
  for (const [job, a] of Object.entries(cfg.agents)) {
    const ok = await canRun(a.command);
    checks.push({
      name: `agent:${job}`,
      level: ok ? "ok" : "fatal",
      detail: ok ? `${a.command} (${resolveAdapter(a.command)})` : `${a.command} を実行できない`,
    });
  }

  // git / gh はエージェント CLI と同格の実行時依存。
  for (const bin of ["git", "gh"]) {
    const ok = await canRun(bin);
    checks.push({
      name: `bin:${bin}`,
      level: ok ? "ok" : "fatal",
      detail: ok ? "found" : `${bin} が見つからない（ワークスペース操作とエージェントの GitHub 書き込みに必須）`,
    });
  }

  for (const r of cfg.repos) {
    const slug = repoSlug(r);
    const base = r.base_branch ?? "HEAD";
    try {
      const { data } = await gh.graphql<{
        repository: {
          isPrivate: boolean;
          viewerPermission: string | null;
          defaultBranchRef: { name: string } | null;
          gate: { __typename: string } | null;
          workflows: { __typename: string } | null;
        } | null;
      }>(REPO_QUERY, {
        owner: r.owner, repo: r.name,
        gate: `${base}:.agents/autopilot-gate.md`,
        wf: `${base}:.github/workflows`,
      });
      const repo = data.repository;
      if (!repo) {
        checks.push({ name: slug, level: "fatal", detail: "リポジトリが見つからない" });
        continue;
      }
      const canWrite = ["WRITE", "MAINTAIN", "ADMIN"].includes(repo.viewerPermission ?? "");
      checks.push({
        name: `${slug}: write`,
        level: canWrite ? "ok" : "fatal",
        detail: canWrite ? repo.viewerPermission! : `bot が Collaborator でない（${repo.viewerPermission}）`,
      });
      checks.push({
        name: `${slug}: visibility`,
        level: repo.isPrivate ? "ok" : "warn",
        detail: repo.isPrivate ? "private" : "public（第三者の Issue 本文がエージェントのプロンプトに混入する）",
      });
      checks.push({
        name: `${slug}: gate`,
        level: repo.gate ? "ok" : "warn",
        detail: repo.gate ? ".agents/autopilot-gate.md あり" : "無し。evaluate は一般的なコード品質のみで判定する",
      });
      checks.push({
        name: `${slug}: workflows`,
        level: repo.workflows ? "ok" : "warn",
        detail: repo.workflows ? ".github/workflows あり" : "無し。CI は Grace Period 経過後に毎回素通りする",
      });
      checks.push({
        name: `${slug}: base`,
        level: "ok",
        detail: r.base_branch ?? repo.defaultBranchRef?.name ?? "main",
      });
    } catch (e) {
      checks.push({ name: slug, level: "fatal", detail: String(e) });
    }
  }

  // Sub-issues API。使えなければ親子機能だけを落とす。
  try {
    const first = cfg.repos[0]!;
    await gh.graphql(SUBISSUE_QUERY, { owner: first.owner, repo: first.name });
    checks.push({ name: "sub-issues api", level: "ok", detail: "利用可能" });
  } catch (e) {
    checks.push({ name: "sub-issues api", level: "warn", detail: `利用不可: ${String(e)}` });
  }

  return checks;
}

export function printChecks(checks: Check[]): boolean {
  const icon = { ok: "✓", warn: "!", fatal: "✗" } as const;
  for (const c of checks) {
    console.log(`${icon[c.level]} ${c.name.padEnd(28)} ${c.detail}`);
  }
  const fatal = checks.filter((c) => c.level === "fatal");
  if (fatal.length > 0) console.log(`\n${fatal.length} 件の致命的な問題があります。起動できません。`);
  return fatal.length === 0;
}

async function canRun(cmd: string): Promise<boolean> {
  try {
    const p = Bun.spawn([cmd, "--version"], { stdout: "ignore", stderr: "ignore" });
    return (await p.exited) === 0;
  } catch {
    return false;
  }
}
