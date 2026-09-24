import { streamMockResponse } from "./mock.ts";
import { isCliAvailable, streamClaudeResponse } from "./stream.ts";
import type { ChatOptions, EventCallback } from "./types.ts";

export * from "./mock.ts";
export * from "./prompt.ts";
export * from "./stream.ts";
export * from "./types.ts";

/**
 * チャット処理のエントリポイント（調査・壁打ち共通、UI 非依存・ストリーミング）
 */
export async function streamChat(options: ChatOptions, emit: EventCallback): Promise<void> {
  // 一旦 autopilot chat から利用できるエージェントは claude に絞る
  const selectedEngine = options.engine || "claude";
  const selectedMode = options.mode || "investigate";
  const isAvailable = isCliAvailable(selectedEngine);
  const useMock = !isAvailable || process.env.MOCK_CHAT === "true";

  if (useMock) {
    await streamMockResponse(
      emit,
      options.card,
      options.message,
      options.conversationId,
      selectedEngine,
      selectedMode,
    );
  } else {
    // 一旦 autopilot chat から利用できるエージェントは claude に絞る
    await streamClaudeResponse(
      emit,
      options.card,
      options.message,
      options.conversationId,
      options.cfg,
      options.env,
      selectedMode,
    );
    /* agy 展開時に復帰
    if (selectedEngine === "claude") {
      await streamClaudeResponse(
        emit,
        options.card,
        options.message,
        options.conversationId,
        options.cfg,
        options.env,
        selectedMode,
      );
    } else {
      await streamAgyResponse(
        emit,
        options.card,
        options.message,
        options.conversationId,
        options.cfg,
        options.env,
        selectedMode,
      );
    }
    */
  }
}
