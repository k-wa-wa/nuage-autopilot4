/**
 * エージェント CLI を呼び出して出力を取得するヘルパー（/usage 取得等で使用）。
 */
export async function runUsageCommand(
  cmd: string,
  args: string[],
  timeoutMs = 15_000,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const proc = Bun.spawn([cmd, ...args], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill();
      } catch {}
    }, timeoutMs);

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    clearTimeout(timer);

    if (timedOut) {
      return { ok: false, stdout: "", stderr: "タイムアウト" };
    }
    return { ok: exitCode === 0, stdout, stderr };
  } catch (e) {
    return { ok: false, stdout: "", stderr: String(e) };
  }
}
