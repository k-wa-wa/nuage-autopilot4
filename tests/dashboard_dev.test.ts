import { describe, expect, test } from "bun:test";
import { createDevApp } from "../src/view/dev.ts";
import { createMockDb, loadScenario, SCENARIOS } from "../src/view/mock.ts";
import { buildState } from "../src/view/state.ts";

describe("Dashboard Dev & Mock Environment", () => {
  test("各シナリオが正常に初期化され、buildState を正しく生成できる", () => {
    // 1. standard
    const { db } = createMockDb("standard");
    let state = buildState(db);
    expect(state.lanes.action_required.length).toBeGreaterThan(0);
    expect(state.lanes.working.length).toBeGreaterThan(0);
    expect(state.lanes.queued.length).toBeGreaterThan(0);
    expect(state.lanes.backlog.length).toBeGreaterThan(0);
    expect(state.health.running_jobs).toBe(2);
    expect(state.health.degraded.length).toBe(0);

    // 2. alerts
    loadScenario(db, "alerts");
    state = buildState(db);
    expect(state.health.degraded.length).toBeGreaterThan(0);
    expect(state.health.degraded.some((d) => d.includes("レートリミット"))).toBe(true);
    expect(state.health.degraded.some((d) => d.includes("ジョブ滞留"))).toBe(true);

    // 3. empty
    loadScenario(db, "empty");
    state = buildState(db);
    expect(state.lanes.action_required.length).toBe(0);
    expect(state.lanes.working.length).toBe(0);
    expect(state.lanes.queued.length).toBe(0);
    expect(state.lanes.backlog.length).toBe(0);
    expect(state.health.running_jobs).toBe(0);

    // 4. dense
    loadScenario(db, "dense");
    state = buildState(db);
    expect(state.lanes.action_required.length).toBeGreaterThanOrEqual(9);
    expect(state.lanes.working.length).toBe(4);
    expect(state.lanes.queued.length).toBe(6);
    expect(state.lanes.backlog.length).toBe(8);

    // 5. errors
    loadScenario(db, "errors");
    state = buildState(db);
    expect(state.lanes.action_required.length).toBe(5);
    const hints = state.lanes.action_required.map((c) => c.display_hint);
    expect(hints).toContain("Triage 失敗（要判断）");
    expect(hints).toContain("CI 失敗（要判断）");
    expect(hints).toContain("助言待ち");
    expect(hints).toContain("エラー対応待ち");
    expect(hints).toContain("中止済み");
  });

  test("createDevApp の HTTP エンドポイントが正常に応答する", async () => {
    const { app } = createDevApp("standard");

    // GET / (HTML)
    const resHtml = await app.request("/");
    expect(resHtml.status).toBe(200);
    const htmlText = await resHtml.text();
    expect(htmlText).toContain("Autopilot");
    expect(htmlText).toContain("dev-scenario-select");
    expect(htmlText).toContain("dev-theme-select");
    expect(htmlText).toContain("Action Required");

    // GET /api/state (JSON)
    const resState = await app.request("/api/state");
    expect(resState.status).toBe(200);
    const stateJson = (await resState.json()) as ReturnType<typeof buildState>;
    expect(stateJson.lanes).toBeDefined();
    expect(stateJson.health).toBeDefined();
    expect(stateJson.health.graphql_remaining).toBeGreaterThan(0);
    expect(stateJson.health.rest_remaining).toBeGreaterThan(0);

    // GET /api/health (JSON)
    const resHealth = await app.request("/api/health");
    expect(resHealth.status).toBe(200);
    const healthJson = (await resHealth.json()) as ReturnType<typeof buildState>["health"];
    expect(healthJson.graphql_remaining).toBeGreaterThan(0);

    // GET /api/dev/scenarios
    const resScenarios = await app.request("/api/dev/scenarios");
    expect(resScenarios.status).toBe(200);
    const scJson = (await resScenarios.json()) as { current: string; scenarios: typeof SCENARIOS };
    expect(scJson.current).toBe("standard");
    expect(scJson.scenarios.length).toBe(SCENARIOS.length);

    // POST /api/dev/scenario/empty
    const resSwitch = await app.request("/api/dev/scenario/empty", { method: "POST" });
    expect(resSwitch.status).toBe(200);
    const switchJson = (await resSwitch.json()) as { ok: boolean; state: ReturnType<typeof buildState> };
    expect(switchJson.ok).toBe(true);
    expect(switchJson.state.lanes.action_required.length).toBe(0);

    // POST /api/dev/scenario/unknown (400)
    const resBad = await app.request("/api/dev/scenario/invalid_scenario", { method: "POST" });
    expect(resBad.status).toBe(400);
  });
});
