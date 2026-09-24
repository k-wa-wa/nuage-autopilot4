import type { DevOptions } from "../pageData.ts";

/** dev サーバー（モック）専用のシナリオ切替バー。 */
export function DevToolbar({ dev }: { dev: DevOptions }) {
  const switchScenario = async (name: string) => {
    const res = await fetch(`/api/dev/scenario/${encodeURIComponent(name)}`, { method: "POST" });
    if (!res.ok) return;
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", name);
    window.history.replaceState({}, "", url);
    window.location.reload();
  };

  return (
    <div class="dev-toolbar">
      <label class="control-group">
        <span>Scenario:</span>
        <select
          value={dev.current}
          onChange={(e) => void switchScenario(e.currentTarget.value)}
          data-testid="dev-scenario-select"
        >
          {dev.scenarios.map((s) => (
            <option key={s.name} value={s.name}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
