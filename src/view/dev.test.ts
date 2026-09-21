import { describe, expect, test } from "bun:test";
import { createDevApp } from "./dev.ts";
import { createMockDb, loadScenario, SCENARIOS } from "./mock.ts";
import { buildState } from "./state.ts";

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
    expect(state.lanes.action_required.length).toBe(7);
    expect(state.lanes.working.length).toBe(2);
    expect(state.lanes.queued.length).toBe(1);
    expect(state.lanes.backlog.length).toBe(1);
    const hints = state.lanes.action_required.map((c) => c.display_hint);
    expect(hints).toContain("Triage 失敗（要判断）");
    expect(hints).toContain("CI 失敗（要判断）");
    expect(hints).toContain("助言待ち");
    expect(hints).toContain("エラー対応待ち");
    expect(hints).toContain("中止済み");
    expect(hints).toContain("仕様確認待ち");
    expect(hints).toContain("マージ待ち");
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
    expect(htmlText).toContain("info-btn");
    expect(htmlText).toContain("info-modal");
    expect(htmlText).toContain("GraphQL API");
    expect(htmlText).toContain("REST API (GitHub)");

    // GET /api/state (JSON)
    const resState = await app.request("/api/state");
    expect(resState.status).toBe(200);
    const stateJson = (await resState.json()) as ReturnType<typeof buildState>;
    expect(stateJson.lanes).toBeDefined();
    expect(stateJson.health).toBeDefined();
    expect(stateJson.health.graphql_remaining).toBeGreaterThan(0);
    expect(stateJson.health.graphql_limit).toBe(5000);
    expect(stateJson.health.graphql_reset_at).not.toBeNull();
    expect(stateJson.health.rest_remaining).toBeGreaterThan(0);
    expect(stateJson.health.rest_limit).toBe(5000);
    expect(stateJson.health.rest_reset_at).not.toBeNull();

    // PR あり/なし の Card プロパティ検証
    const cardWithPr = stateJson.lanes.action_required.find((c) => c.pr_number > 0);
    expect(cardWithPr).toBeDefined();
    expect(cardWithPr?.issue_url).toBe(
      `https://github.com/${cardWithPr?.repo}/issues/${cardWithPr?.issue_number}`,
    );
    expect(cardWithPr?.pr_url).toBe(
      `https://github.com/${cardWithPr?.repo}/pull/${cardWithPr?.pr_number}`,
    );

    const cardWithoutPr = stateJson.lanes.action_required.find((c) => c.pr_number === 0);
    expect(cardWithoutPr).toBeDefined();
    expect(cardWithoutPr?.issue_url).toBe(
      `https://github.com/${cardWithoutPr?.repo}/issues/${cardWithoutPr?.issue_number}`,
    );
    expect(cardWithoutPr?.pr_url).toBeNull();

    // GET /api/health (JSON)
    const resHealth = await app.request("/api/health");
    expect(resHealth.status).toBe(200);
    const healthJson = (await resHealth.json()) as ReturnType<typeof buildState>["health"];
    expect(healthJson.graphql_remaining).toBeGreaterThan(0);
    expect(healthJson.graphql_limit).toBe(5000);
    expect(healthJson.rest_remaining).toBeGreaterThan(0);
    expect(healthJson.rest_limit).toBe(5000);

    const agyUsage = healthJson.agent_usages.find((u) => u.adapter === "agy");
    expect(agyUsage).toBeDefined();
    expect(agyUsage?.limits.every((lim) => !lim.label.startsWith("Claude/GPT"))).toBe(true);
    expect(agyUsage?.limits.some((lim) => lim.label.startsWith("Gemini"))).toBe(true);

    // GET /api/dev/scenarios
    const resScenarios = await app.request("/api/dev/scenarios");
    expect(resScenarios.status).toBe(200);
    const scJson = (await resScenarios.json()) as { current: string; scenarios: typeof SCENARIOS };
    expect(scJson.current).toBe("standard");
    expect(scJson.scenarios.length).toBe(SCENARIOS.length);

    // POST /api/dev/scenario/empty
    const resSwitch = await app.request("/api/dev/scenario/empty", { method: "POST" });
    expect(resSwitch.status).toBe(200);
    const switchJson = (await resSwitch.json()) as {
      ok: boolean;
      state: ReturnType<typeof buildState>;
    };
    expect(switchJson.ok).toBe(true);
    expect(switchJson.state.lanes.action_required.length).toBe(0);

    // POST /api/dev/scenario/unknown (400)
    const resBad = await app.request("/api/dev/scenario/invalid_scenario", { method: "POST" });
    expect(resBad.status).toBe(400);
  });

  test("各レーンが新しい順（降順）にソートされている", () => {
    const { db } = createMockDb("dense");
    const state = buildState(db);

    // Action Required: state_since 降順
    for (let i = 1; i < state.lanes.action_required.length; i++) {
      const prev = state.lanes.action_required[i - 1]!.state_since;
      const curr = state.lanes.action_required[i]!.state_since;
      expect(prev.localeCompare(curr)).toBeGreaterThanOrEqual(0);
    }

    // Queued: state_since 降順
    for (let i = 1; i < state.lanes.queued.length; i++) {
      const prev = state.lanes.queued[i - 1]!.state_since;
      const curr = state.lanes.queued[i]!.state_since;
      expect(prev.localeCompare(curr)).toBeGreaterThanOrEqual(0);
    }

    // Backlog: state_since 降順
    for (let i = 1; i < state.lanes.backlog.length; i++) {
      const prev = state.lanes.backlog[i - 1]!.state_since;
      const curr = state.lanes.backlog[i]!.state_since;
      expect(prev.localeCompare(curr)).toBeGreaterThanOrEqual(0);
    }
  });

  test("エラーカードに error_detail と複数エラー履歴 (error_history) が正しく反映される", () => {
    const { db } = createMockDb("errors");
    const state = buildState(db);

    // #72: CI 失敗（リトライ3回すべて失敗したカード）
    const item72 = state.lanes.action_required.find((c) => c.issue_number === 72);
    expect(item72).toBeDefined();
    expect(item72?.error_detail).not.toBeNull();
    expect(item72?.error_detail?.summary).toContain("試行 3/3");
    // 複数エラー履歴（3件）が保持されていること
    expect(item72?.error_history).toBeDefined();
    expect(item72?.error_history?.length).toBe(3);
    expect(item72?.error_history?.[0]?.summary).toContain("試行 3/3");
    expect(item72?.error_history?.[1]?.summary).toContain("試行 2/3");
    expect(item72?.error_history?.[2]?.summary).toContain("試行 1/3");

    // standard シナリオの pechka#61（本番再現カード）
    loadScenario(db, "standard");
    const stdState = buildState(db);
    const pechka61 = stdState.lanes.action_required.find(
      (c) => c.repo === "k-wa-wa/pechka" && c.issue_number === 61,
    );
    expect(pechka61).toBeDefined();
    expect(pechka61?.display_hint).toBe("エラー対応待ち");
    expect(pechka61?.error_detail).not.toBeNull();
    expect(pechka61?.error_detail?.summary).toContain("Claude Code 実行失敗");
  });

  test("各カードに job_history が降順（新しい順）で正しく格納され、所要時間が計算される", () => {
    const { db } = createMockDb("standard");
    const state = buildState(db);

    // nuage-cluster#40（マルチステップ・リトライ経由で成功）
    const cluster40 = state.lanes.action_required.find(
      (c) => c.repo === "k-wa-wa/nuage-cluster" && c.issue_number === 40,
    );
    expect(cluster40).toBeDefined();
    expect(cluster40?.job_history).toBeDefined();
    expect(cluster40?.job_history?.length).toBe(4);

    // 新しい順（降順）チェック
    const runs = cluster40!.job_history!;
    expect(runs[0]?.job_type).toBe("evaluate");
    expect(runs[0]?.result).toBe("SUCCESS");
    expect(runs[0]?.duration_sec).toBe(86);
    expect(runs[0]?.summary).toContain("PRレビュー完了: merge_ready");
    expect(runs[0]?.next_context).toContain("レビュー承認済み");

    expect(runs[1]?.job_type).toBe("evaluate");
    expect(runs[1]?.result).toBe("FAIL");
    expect(runs[1]?.duration_sec).toBe(63);

    expect(runs[2]?.job_type).toBe("evaluate");
    expect(runs[2]?.result).toBe("FAIL");
    expect(runs[2]?.duration_sec).toBe(1);

    expect(runs[3]?.job_type).toBe("implement");
    expect(runs[3]?.result).toBe("SUCCESS");
    expect(runs[3]?.duration_sec).toBe(336);

    // bare-web-proxy#7
    const proxy7 = state.lanes.action_required.find(
      (c) => c.repo === "k-wa-wa/bare-web-proxy" && c.issue_number === 7,
    );
    expect(proxy7).toBeDefined();
    expect(proxy7?.job_history?.length).toBe(3);
    expect(proxy7?.job_history?.[0]?.job_type).toBe("evaluate");
    expect(proxy7?.job_history?.[0]?.result).toBe("SUCCESS");
    expect(proxy7?.job_history?.[0]?.duration_sec).toBe(123);

    // pechka#55 (6段階の実行履歴)
    const pechka55 = state.lanes.action_required.find(
      (c) => c.repo === "k-wa-wa/pechka" && c.issue_number === 55,
    );
    expect(pechka55).toBeDefined();
    expect(pechka55?.job_history?.length).toBe(6);
    expect(pechka55?.job_history?.[0]?.result).toBe("BLOCKED");
    expect(pechka55?.job_history?.[0]?.summary).toContain("3回連続失敗のためブロック");
  });

  test("親子関係のデータおよびHTML属性（コネクタ線用）が正しく出力される", async () => {
    const { app, db } = createDevApp("standard");
    const state = buildState(db);

    // 親カード #95 の検証
    const parentCard = state.lanes.working.find((c) => c.issue_number === 95);
    expect(parentCard).toBeDefined();
    expect(parentCard?.sub_issues_total).toBe(5);
    expect(parentCard?.sub_issues_completed).toBe(2);
    expect(parentCard?.sub_issue_numbers).toBeDefined();
    expect(parentCard?.sub_issue_numbers).toContain(96);
    expect(parentCard?.sub_issue_numbers).toContain(97);

    // 子カード #96 (Queued) の検証
    const childQueued = state.lanes.queued.find((c) => c.issue_number === 96);
    expect(childQueued).toBeDefined();
    expect(childQueued?.parent_issue_number).toBe(95);
    expect(childQueued?.parent_repo).toBe("k-wa-wa/nuage-autopilot4");

    // 子カード #97 (ActionRequired) の検証
    const childAr = state.lanes.action_required.find((c) => c.issue_number === 97);
    expect(childAr).toBeDefined();
    expect(childAr?.parent_issue_number).toBe(95);

    // HTML の検証
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const html = await res.text();

    // SVG コネクタ要素が存在すること
    expect(html).toContain('id="relation-connector-canvas"');
    expect(html).toContain('class="relation-connector-svg"');
    expect(html).toContain('id="relation-connector-layer"');

    // 親カードの属性と子バッジ
    expect(html).toContain('data-key="k-wa-wa/nuage-autopilot4#95"');
    expect(html).toContain('data-is-parent="true"');
    expect(html).toContain('class="relation-badge child-badge"');
    expect(html).toContain('data-child-key="k-wa-wa/nuage-autopilot4#96"');
    expect(html).toContain('data-child-key="k-wa-wa/nuage-autopilot4#97"');
    expect(html).toContain("子: #96");
    expect(html).toContain("子: #97");

    // 子カードの属性と親バッジ
    expect(html).toContain('data-key="k-wa-wa/nuage-autopilot4#96"');
    expect(html).toContain('data-parent-key="k-wa-wa/nuage-autopilot4#95"');
    expect(html).toContain('class="relation-badge parent-badge"');
    expect(html).toContain("親: #95");
  });
});
