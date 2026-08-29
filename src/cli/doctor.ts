import type { Config } from "../config.ts";
import { loadConfig, repoSlug } from "../config.ts";
import { resolveAdapter } from "../execute/adapters.ts";
import type { GitHubClient } from "../github/client.ts";
import { createClient } from "../github/client.ts";
import { c } from "./utils/color.ts";

export async function cmdDoctor(configPath?: string): Promise<void> {
  const cfg = loadConfig(configPath);
  const ok = printChecks(await doctor(cfg, createClient(cfg.token)));
  process.exit(ok ? 0 : 1);
}

/**
 * 起動時検証（spec.md）。
 * 設定ミスの多くは「実行時になって初めて失敗する」。doctor はそれを起動前に潰す。
 * autopilot run も起動時に同じ検証を通す。
 */

export interface Check {
  category?: string;
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
  const catAuth = "GitHub 認証・アカウント";
  const catEnv = "実行環境・CLI ツール";
  const catFeatures = "GitHub API 機能";

  // 1. bot アカウントの検証
  let bot = "";
  try {
    bot = await gh.viewerLogin();
    checks.push(
      cfg.allowlist.includes(bot)
        ? {
            category: catAuth,
            name: "bot account",
            level: "fatal",
            detail: `GH_TOKEN の所有者 @${bot} が allowlist に含まれている。専用 bot アカウントのトークンを使うこと（自己トリガーの無限ループになる）`,
          }
        : { category: catAuth, name: "bot account", level: "ok", detail: `@${bot}` },
    );
  } catch (e) {
    checks.push({
      category: catAuth,
      name: "bot account",
      level: "fatal",
      detail: `viewer の取得に失敗: ${String(e)}`,
    });
    return checks;
  }

  // レートリミット情報の取得
  try {
    const res = await gh.rest("/rate_limit");
    if (res.ok) {
      const data = (await res.json()) as {
        resources: {
          core: { limit: number; remaining: number; reset: number };
          graphql?: { limit: number; remaining: number; reset: number };
        };
      };
      const core = data.resources.core;
      const gql = data.resources.graphql;
      if (gql) {
        const gqlLevel = gql.remaining < 200 ? "fatal" : gql.remaining < 1000 ? "warn" : "ok";
        checks.push({
          category: catAuth,
          name: "rate limit (GraphQL)",
          level: gqlLevel,
          detail: `${gql.remaining.toLocaleString()} / ${gql.limit.toLocaleString()} 残り (${formatReset(gql.reset)})`,
        });
      }
      if (core) {
        const coreLevel = core.remaining < 200 ? "fatal" : core.remaining < 1000 ? "warn" : "ok";
        checks.push({
          category: catAuth,
          name: "rate limit (REST)",
          level: coreLevel,
          detail: `${core.remaining.toLocaleString()} / ${core.limit.toLocaleString()} 残り (${formatReset(core.reset)})`,
        });
      }
    }
  } catch {
    // レートリミット取得の失敗は致命的ではないためスキップ
  }

  // 2. エージェント CLI が起動できること
  for (const [job, a] of Object.entries(cfg.agents)) {
    const info = await checkBin(a.command);
    checks.push({
      category: catEnv,
      name: `agent:${job}`,
      level: info.ok ? "ok" : "fatal",
      detail: info.ok
        ? `${a.command} (${resolveAdapter(a.command)})${info.version ? ` [${info.version}]` : ""}`
        : `${a.command} を実行できない`,
    });
  }

  // 3. git / gh の確認
  for (const bin of ["git", "gh"]) {
    const info = await checkBin(bin);
    checks.push({
      category: catEnv,
      name: `bin:${bin}`,
      level: info.ok ? "ok" : "fatal",
      detail: info.ok
        ? `found${info.version ? ` (${info.version})` : ""}`
        : `${bin} が見つからない（ワークスペース操作とエージェントの GitHub 書き込みに必須）`,
    });
  }

  // 4. 各リポジトリの検証
  for (const r of cfg.repos) {
    const slug = repoSlug(r);
    const catRepo = `リポジトリ: ${slug}`;
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
        owner: r.owner,
        repo: r.name,
        gate: `${base}:.agents/autopilot-gate.md`,
        wf: `${base}:.github/workflows`,
      });
      const repo = data.repository;
      if (!repo) {
        checks.push({
          category: catRepo,
          name: slug,
          level: "fatal",
          detail: "リポジトリが見つからない",
        });
        continue;
      }
      const canWrite = ["WRITE", "MAINTAIN", "ADMIN"].includes(repo.viewerPermission ?? "");
      checks.push({
        category: catRepo,
        name: "write permission",
        level: canWrite ? "ok" : "fatal",
        detail: canWrite
          ? `${repo.viewerPermission}`
          : `bot が Collaborator でない (${repo.viewerPermission ?? "NONE"})`,
      });
      checks.push({
        category: catRepo,
        name: "visibility",
        level: repo.isPrivate ? "ok" : "warn",
        detail: repo.isPrivate
          ? "private"
          : "public（第三者の Issue 本文がエージェントのプロンプトに混入する）",
      });
      checks.push({
        category: catRepo,
        name: "base branch",
        level: "ok",
        detail: r.base_branch ?? repo.defaultBranchRef?.name ?? "main",
      });
      checks.push({
        category: catRepo,
        name: "quality gate",
        level: repo.gate ? "ok" : "warn",
        detail: repo.gate
          ? ".agents/autopilot-gate.md あり"
          : "無し（evaluate は一般的なコード品質のみで判定）",
      });
      checks.push({
        category: catRepo,
        name: "workflows",
        level: repo.workflows ? "ok" : "warn",
        detail: repo.workflows
          ? ".github/workflows あり"
          : "無し（CI は Grace Period 経過後に毎回素通りする）",
      });
    } catch (e) {
      checks.push({ category: catRepo, name: slug, level: "fatal", detail: String(e) });
    }
  }

  // 5. Sub-issues API
  try {
    const first = cfg.repos[0]!;
    await gh.graphql(SUBISSUE_QUERY, { owner: first.owner, repo: first.name });
    checks.push({ category: catFeatures, name: "sub-issues api", level: "ok", detail: "利用可能" });
  } catch (e) {
    checks.push({
      category: catFeatures,
      name: "sub-issues api",
      level: "warn",
      detail: `利用不可: ${String(e)}`,
    });
  }

  return checks;
}

export function printChecks(checks: Check[]): boolean {
  const icon = {
    ok: c.boldGreen("✓"),
    warn: c.boldYellow("!"),
    fatal: c.boldRed("✗"),
  } as const;

  // カテゴリごとにグループ化
  const groups = new Map<string, Check[]>();
  for (const c of checks) {
    const cat = c.category ?? "基本検証";
    const list = groups.get(cat) ?? [];
    list.push(c);
    groups.set(cat, list);
  }

  console.log("");
  for (const [cat, items] of groups) {
    const lineLen = Math.max(0, 56 - cat.length - 4);
    console.log(`${c.boldCyan(`── ${cat} `)}${c.gray("─".repeat(lineLen))}`);
    for (const item of items) {
      const name = item.name.padEnd(24);
      let detail = item.detail;
      if (item.level === "ok") {
        detail = c.gray(detail);
      } else if (item.level === "warn") {
        detail = c.yellow(detail);
      } else if (item.level === "fatal") {
        detail = c.boldRed(detail);
      }
      console.log(`  ${icon[item.level]} ${c.bold(name)} ${detail}`);
    }
    console.log("");
  }

  const okCount = checks.filter((c) => c.level === "ok").length;
  const warnCount = checks.filter((c) => c.level === "warn").length;
  const fatalCount = checks.filter((c) => c.level === "fatal").length;

  console.log(c.gray("─".repeat(60)));
  const summaryParts = [
    c.boldGreen(`${okCount} 正常`),
    warnCount > 0 ? c.boldYellow(`${warnCount} 警告`) : c.gray("0 警告"),
    fatalCount > 0 ? c.boldRed(`${fatalCount} エラー`) : c.gray("0 エラー"),
  ];
  console.log(`結果: ${summaryParts.join(c.gray(" / "))}`);

  if (fatalCount > 0) {
    console.log(c.boldRed(`\n✗ ${fatalCount} 件の致命的な問題があります。起動できません。`));
  } else if (warnCount > 0) {
    console.log(c.boldYellow(`\n✓ 起動可能です（${warnCount} 件の警告があります）。`));
  } else {
    console.log(c.boldGreen(`\n✓ すべての検証をパスしました。起動可能です。`));
  }

  return fatalCount === 0;
}

function formatReset(resetSec: number): string {
  const date = new Date(resetSec * 1000);
  const now = Date.now();
  const diffMin = Math.max(0, Math.round((date.getTime() - now) / 60000));
  const timeStr = date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  return diffMin > 0 ? `リセット: ${timeStr} / 約${diffMin}分後` : `リセット: ${timeStr}`;
}

async function checkBin(cmd: string): Promise<{ ok: boolean; version?: string }> {
  try {
    const p = Bun.spawn([cmd, "--version"], { stdout: "pipe", stderr: "ignore" });
    const exited = await p.exited;
    if (exited !== 0) return { ok: false };
    const stdout = await new Response(p.stdout).text();
    const firstLine = stdout.trim().split("\n")[0]?.trim();
    return { ok: true, version: firstLine ? cleanVersion(firstLine) : undefined };
  } catch {
    return { ok: false };
  }
}

function cleanVersion(v: string): string {
  // "git version 2.44.0" -> "2.44.0", "claude 1.0.0" -> "1.0.0" などの整形
  const m = /v?(\d+\.\d+(\.\d+)?)/.exec(v);
  return m ? `v${m[1]}` : v.slice(0, 20);
}
