import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../config.ts";
import { chatWorkspaceDir } from "../../config.ts";

export interface RestoredToolCall {
  id: string;
  name: string;
  detail: string;
}

export interface RestoredChatMessage {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  tools?: RestoredToolCall[];
}

/**
 * ツール引数オブジェクトから、一行サマリーを抽出する。
 */
export function summarizeToolArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const obj = args as Record<string, unknown>;
  const preferredKeys = [
    "command",
    "CommandLine",
    "cmd",
    "file_path",
    "path",
    "pattern",
    "query",
    "url",
    "description",
  ];
  for (const key of preferredKeys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const firstString = Object.values(obj).find((v) => typeof v === "string" && v.trim());
  return typeof firstString === "string" ? firstString.trim() : "";
}

/**
 * プロンプトテンプレートからユーザー本来の入力文字列を抽出する。
 * システム通知（task-notification 等）は空文字を返して除外する。
 */
export function extractUserPrompt(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();

  // システム通知・バックグラウンド完了通知はスキップ
  if (trimmed.startsWith("<task-notification>") || trimmed.startsWith("<task-id>")) {
    return "";
  }

  // 【指示・質問】\n... または 【ユーザーの相談・メッセージ】\n... を優先抽出
  const markerMatch = trimmed.match(
    /(?:【指示・質問】|【ユーザーの相談・メッセージ】)\s*\n([\s\S]*)$/,
  );
  if (markerMatch?.[1]) {
    return markerMatch[1].trim();
  }

  // テンプレートが見当たらない場合は本文をそのまま返す
  return trimmed;
}

/**
 * ディレクトリパスから Claude の project slug を生成する。
 * 例: /var/lib/autopilot/... -> -var-lib-autopilot-...
 */
export function pathToProjectSlug(dirPath: string): string {
  return dirPath.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * Claude Code のセッション JSONL ファイルパスを解決する。
 */
export function resolveClaudeSessionPath(
  sessionId: string,
  cwdOrRepo?: string,
  cfg?: Config,
): string | null {
  if (!sessionId) return null;

  // モック環境のセッションファイル
  if (sessionId.startsWith("mock-")) {
    const mockPath = join(tmpdir(), `mock-claude-session-${sessionId}.jsonl`);
    if (existsSync(mockPath)) return mockPath;
  }

  const claudeProjectsDir = join(homedir(), ".claude", "projects");
  if (!existsSync(claudeProjectsDir)) return null;

  // 1. cwd または repo から直接パスを推定して確認
  let targetCwd = cwdOrRepo;
  if (cwdOrRepo && !cwdOrRepo.startsWith("/") && cfg) {
    targetCwd = chatWorkspaceDir(cfg, cwdOrRepo);
  }

  if (targetCwd) {
    const slug = pathToProjectSlug(targetCwd);
    const directPath = join(claudeProjectsDir, slug, `${sessionId}.jsonl`);
    if (existsSync(directPath)) {
      return directPath;
    }
  }

  // 2. ~/.claude/projects/ 配下のプロジェクトディレクトリを走査して検索
  try {
    const entries = readdirSync(claudeProjectsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        const candidate = join(claudeProjectsDir, ent.name, `${sessionId}.jsonl`);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
  } catch {
    // ディレクトリ走査エラー時は null
  }

  return null;
}

/**
 * Claude セッション JSONL をパースして、UI 表示用の会話メッセージ一覧へ整形する。
 */
export function parseClaudeSessionLines(lines: string[]): RestoredChatMessage[] {
  const result: RestoredChatMessage[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const type = parsed.type;
    const message = parsed.message as Record<string, unknown> | undefined;

    // 1. ユーザー発言
    if (type === "user" && message && typeof message.content === "string") {
      const userText = extractUserPrompt(message.content);
      if (!userText) continue;

      result.push({
        role: "user",
        content: userText,
      });
      continue;
    }

    // 2. アシスタント返答
    if (type === "assistant" && message && Array.isArray(message.content)) {
      let chunkText = "";
      let chunkThinking = "";
      const chunkTools: RestoredToolCall[] = [];

      for (const block of message.content) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;

        if (b.type === "text" && typeof b.text === "string") {
          chunkText += b.text;
        } else if (b.type === "thinking" && typeof b.thinking === "string") {
          chunkThinking += b.thinking;
        } else if (b.type === "tool_use") {
          chunkTools.push({
            id: typeof b.id === "string" ? b.id : "",
            name: typeof b.name === "string" ? b.name : "tool",
            detail: summarizeToolArgs(b.input),
          });
        }
      }

      // 何も中身がなければスキップ
      if (!chunkText && !chunkThinking && chunkTools.length === 0) {
        continue;
      }

      // 直前が assistant であれば同一ターンとしてマージ
      const lastMsg = result[result.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        if (chunkText) {
          lastMsg.content = lastMsg.content ? `${lastMsg.content}\n${chunkText}` : chunkText;
        }
        if (chunkThinking) {
          lastMsg.thinking = lastMsg.thinking
            ? `${lastMsg.thinking}\n${chunkThinking}`
            : chunkThinking;
        }
        if (chunkTools.length > 0) {
          lastMsg.tools = [...(lastMsg.tools ?? []), ...chunkTools];
        }
      } else {
        result.push({
          role: "assistant",
          content: chunkText,
          thinking: chunkThinking || undefined,
          tools: chunkTools.length > 0 ? chunkTools : undefined,
        });
      }
    }
  }

  return result;
}

/**
 * ファイルパスを指定して Claude セッション JSONL を読み込み・パースする。
 */
export function loadClaudeSession(filePath: string): RestoredChatMessage[] {
  if (!existsSync(filePath)) return [];
  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    return parseClaudeSessionLines(lines);
  } catch {
    return [];
  }
}
