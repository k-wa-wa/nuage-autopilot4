import { useEffect, useState } from "preact/hooks";
import type { DevOptions } from "../pageData.ts";

type Theme = "system" | "light" | "dark";
const THEME_STORAGE_KEY = "autopilot_dev_theme";

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/** dev サーバー（モック）専用のシナリオ・テーマ切替バー。 */
export function DevToolbar({ dev }: { dev: DevOptions }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") setTheme(saved);
  }, []);

  useEffect(() => applyTheme(theme), [theme]);

  const changeTheme = (next: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setTheme(next);
  };

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
      <label class="control-group">
        <span>Theme:</span>
        <select
          value={theme}
          onChange={(e) => changeTheme(e.currentTarget.value as Theme)}
          data-testid="dev-theme-select"
        >
          <option value="system">🌓 System (OS追従)</option>
          <option value="light">☀️ Light</option>
          <option value="dark">🌙 Dark</option>
        </select>
      </label>
    </div>
  );
}
