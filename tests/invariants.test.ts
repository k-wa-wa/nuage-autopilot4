import { describe, expect, test } from "bun:test";
import { decideCiAction, shaFromTriggerKey } from "../src/decide/ci.ts";
import { newEvents } from "../src/decide/dispatcher.ts";
import { fastPassApplies, isApproval } from "../src/decide/fastpass.ts";
import { aggregate } from "../src/decide/subissues.ts";
import { forcedSync } from "../src/decide/sync.ts";
import { VersionConflict } from "../src/store/db.ts";
import * as items from "../src/store/items.ts";
import * as jobs from "../src/store/jobs.ts";
import * as runsStore from "../src/store/runs.ts";
import { hintMatchesState, isDisplayHint, subProgress } from "../src/types.ts";
import { issue, memDb, pr, seedItem } from "./helpers.ts";

/**
 * 不変条件のテスト。
 * 「A で宣言した規則が B で強制されていない」形の欠陥を、散文ではなくここで防ぐ。
 */

describe("値域が閉じている", () => {
  test("表に無い display_hint を弾く", () => {
    expect(isDisplayHint("仕様確認待ち")).toBe(true);
    expect(isDisplayHint(subProgress(1, 2))).toBe(true);
    expect(isDisplayHint("キュー 2 番目")).toBe(false);
    expect(isDisplayHint("子タスク進行中")).toBe(false);
  });

  test("state と hint の組み合わせを検証する", () => {
    expect(hintMatchesState("ActionRequired", "マージ待ち")).toBe(true);
    expect(hintMatchesState("Working", "マージ待ち")).toBe(false);
    expect(hintMatchesState("Working", subProgress(0, 3))).toBe(true);
    expect(hintMatchesState("Queued", "着手待ち")).toBe(true);
    expect(hintMatchesState("Done", "")).toBe(true);
  });

  test("hintToState は display_hint から正しく state を導出する", () => {
    const { hintToState } = require("../src/types.ts");
    expect(hintToState("マージ待ち")).toBe("ActionRequired");
    expect(hintToState("仕様確認待ち")).toBe("ActionRequired");
    expect(hintToState("助言待ち")).toBe("ActionRequired");
    expect(hintToState("CI 待ち")).toBe("Working");
    expect(hintToState(subProgress(1, 3))).toBe("Working");
    expect(hintToState("着手待ち")).toBe("Queued");
    expect(hintToState("")).toBe("Done");
  });

  test("transitionItem は値域外を拒否する", () => {
    const db = memDb();
    const it = seedItem(db, { repo: "o/r", issue_number: 1 });
    expect(() => items.transitionItem(db, it, { state: "Working", hint: "マージ待ち" })).toThrow(
      /invalid display_hint/,
    );
  });
});

describe("CI 判定は 1 箇所に閉じている", () => {
  const base = { repo: "o/r", issue_number: 1, pr_number: 10, head_sha: "a".repeat(40) };

  test("ci_since が NULL なら対象外（人間が作った既存 PR）", () => {
    const db = memDb();
    const it = seedItem(db, { ...base, ci_since: null });
    expect(decideCiAction(it, pr()).kind).toBe("skip");
  });

  test("HEAD 不一致なら待つ（修正 push 直後に古い緑を読まない）", () => {
    const db = memDb();
    const it = seedItem(db, {
      ...base,
      ci_since: "2026-08-24T00:00:00Z",
      head_sha: "b".repeat(40),
    });
    const a = decideCiAction(it, pr());
    expect(a).toEqual({ kind: "wait", hint: "CI 未反映" });
  });

  test("SUCCESS で evaluate、trigger_key に sha が入る", () => {
    const db = memDb();
    const it = seedItem(db, { ...base, ci_since: "2026-08-24T00:00:00Z" });
    const a = decideCiAction(it, pr());
    expect(a.kind).toBe("evaluate");
    if (a.kind === "evaluate") expect(shaFromTriggerKey(a.triggerKey)).toBe("a".repeat(40));
  });

  test("Draft は触らない", () => {
    const db = memDb();
    const it = seedItem(db, { ...base, ci_since: "2026-08-24T00:00:00Z" });
    expect(decideCiAction(it, pr({ isDraft: true })).kind).toBe("skip");
  });

  test("null は Grace Period 内は待ち、経過後は NO_CI で成功扱い", () => {
    const db = memDb();
    const t0 = Date.parse("2026-08-24T00:00:00Z");
    const it = seedItem(db, { ...base, ci_since: "2026-08-24T00:00:00Z" });
    const noCi = pr({
      commits: { nodes: [{ commit: { oid: "a".repeat(40), statusCheckRollup: null } }] },
    });
    expect(decideCiAction(it, noCi, t0 + 5 * 60_000)).toEqual({ kind: "wait", hint: "CI 待ち" });
    const late = decideCiAction(it, noCi, t0 + 11 * 60_000);
    expect(late.kind).toBe("evaluate");
    if (late.kind === "evaluate") expect(late.triggerKey).toContain(":NO_CI");
  });

  test("PENDING は 30 分で停滞にエスカレーション", () => {
    const db = memDb();
    const t0 = Date.parse("2026-08-24T00:00:00Z");
    const it = seedItem(db, { ...base, ci_since: "2026-08-24T00:00:00Z" });
    const p = pr({
      commits: {
        nodes: [{ commit: { oid: "a".repeat(40), statusCheckRollup: { state: "PENDING" } } }],
      },
    });
    expect(decideCiAction(it, p, t0 + 10 * 60_000)).toEqual({ kind: "wait", hint: "CI 待ち" });
    expect(decideCiAction(it, p, t0 + 31 * 60_000)).toEqual({ kind: "escalate", hint: "CI 停滞" });
  });

  test("FAILURE はリトライ上限まで再実装、超えたら人間へ", () => {
    const db = memDb();
    const p = pr({
      commits: {
        nodes: [{ commit: { oid: "a".repeat(40), statusCheckRollup: { state: "FAILURE" } } }],
      },
    });
    const ok = seedItem(db, { ...base, ci_since: "2026-08-24T00:00:00Z", retry_count: 4 });
    expect(decideCiAction(ok, p).kind).toBe("reimplement");
    const over = seedItem(db, {
      repo: "o/r",
      issue_number: 2,
      pr_number: 11,
      head_sha: "a".repeat(40),
      ci_since: "2026-08-24T00:00:00Z",
      retry_count: 5,
    });
    expect(decideCiAction(over, p)).toEqual({ kind: "escalate", hint: "CI 失敗（要判断）" });
  });
});

describe("FastPass のガード", () => {
  test("承認語に完全一致すること", () => {
    expect(isApproval(" OK ")).toBe(true);
    expect(isApproval("了解！")).toBe(true);
    expect(isApproval("OK だけどここ直して")).toBe(false);
  });

  test("仕様確認待ち以外の OK は通さない", () => {
    const db = memDb();
    const merge = seedItem(db, {
      repo: "o/r",
      issue_number: 1,
      state: "ActionRequired",
      display_hint: "マージ待ち",
    });
    expect(fastPassApplies(merge, "OK")).toBe(false);
  });

  test("子を持つ親の OK は通さない（ファンアウトを意味するため）", () => {
    const db = memDb();
    const parent = seedItem(db, {
      repo: "o/r",
      issue_number: 1,
      state: "ActionRequired",
      display_hint: "仕様確認待ち",
      sub_issues_total: 2,
    });
    expect(fastPassApplies(parent, "OK")).toBe(false);
  });

  test("子なし・仕様確認待ちなら通す", () => {
    const db = memDb();
    const it = seedItem(db, {
      repo: "o/r",
      issue_number: 1,
      state: "ActionRequired",
      display_hint: "仕様確認待ち",
    });
    expect(fastPassApplies(it, "OK")).toBe(true);
  });
});

describe("強制同期は first-match", () => {
  test("Draft のまま未マージでクローズされた PR は取り下げが勝つ", () => {
    const db = memDb();
    const it = seedItem(db, {
      repo: "o/r",
      issue_number: 1,
      pr_number: 10,
      branch: "f",
      head_sha: "x",
    });
    const r = forcedSync(db, {
      item: it,
      issue: issue(),
      pr: pr({ state: "CLOSED", merged: false, isDraft: true }),
      allowlist: ["human"],
      prevIssueState: "OPEN",
    });
    expect(r.rule).toBe("pr-closed-unmerged");
    const after = items.getItem(db, "o/r", 1)!;
    expect(after.display_hint).toBe("取り下げ確認待ち");
    // 紐付けをリセットしないと、次の implement が閉じた PR のブランチに push する。
    expect(after.pr_number).toBe(0);
    expect(after.ci_since).toBeNull();
  });

  test("Issue クローズが Done を確定し、未完了ジョブを止める", () => {
    const db = memDb();
    const it = seedItem(db, { repo: "o/r", issue_number: 1 });
    jobs.enqueueJob(db, {
      repo: "o/r",
      issue_number: 1,
      job_type: "implement",
      job_context: "c",
      trigger_key: "k",
    });
    forcedSync(db, {
      item: it,
      issue: issue({ state: "CLOSED", stateReason: "COMPLETED" }),
      pr: null,
      allowlist: ["human"],
      prevIssueState: "OPEN",
    });
    expect(items.getItem(db, "o/r", 1)!.state).toBe("Done");
    expect(jobs.hasActiveJob(db, "o/r", 1)).toBe(false);
  });

  test("子が Done になると親に recheck が立ち fingerprint がクリアされる", () => {
    const db = memDb();
    seedItem(db, { repo: "o/r", issue_number: 1, sub_issues_total: 1 });
    const child = seedItem(db, {
      repo: "o/r",
      issue_number: 2,
      parent_repo: "o/r",
      parent_issue_number: 1,
    });
    db.query(`INSERT INTO github_cache (repo,item_type,number,node_id,fingerprint,github_updated_at,synced_at)
              VALUES ('o/r','issue',1,'I_1','fp','t','t')`).run();
    forcedSync(db, {
      item: child,
      issue: issue({ number: 2, state: "CLOSED", stateReason: "COMPLETED" }),
      pr: null,
      allowlist: ["human"],
      prevIssueState: "OPEN",
    });
    expect(items.getItem(db, "o/r", 1)!.recheck_needed).toBe(1);
    const fp = db.query("SELECT fingerprint f FROM github_cache WHERE number=1").get() as {
      f: string;
    };
    expect(fp.f).toBe("");
  });

  test("allowlist 内の人間による未 Triage の新規起票だけ refine を積む", () => {
    const db = memDb();
    const mine = seedItem(db, { repo: "o/r", issue_number: 1, triaged: 0 });
    const r1 = forcedSync(db, {
      item: mine,
      issue: issue(),
      pr: null,
      allowlist: ["human"],
      prevIssueState: "OPEN",
    });
    expect(r1.enqueued?.job_type).toBe("refine");
    expect(items.getItem(db, "o/r", 1)!.triaged).toBe(1);

    const theirs = seedItem(db, { repo: "o/r", issue_number: 2, triaged: 0 });
    const r2 = forcedSync(db, {
      item: theirs,
      issue: issue({ number: 2, author: { login: "stranger" } }),
      pr: null,
      allowlist: ["human"],
      prevIssueState: "OPEN",
    });
    expect(r2.handled).toBe(false);
  });

  test("bot が作った子 Issue には refine を積まない", () => {
    const db = memDb();
    const child = seedItem(db, {
      repo: "o/r",
      issue_number: 2,
      triaged: 0,
      parent_repo: "o/r",
      parent_issue_number: 1,
    });
    const r = forcedSync(db, {
      item: child,
      issue: issue({
        number: 2,
        author: { login: "bot" },
        parent: { number: 1, repository: { nameWithOwner: "o/r" } },
      }),
      pr: null,
      allowlist: ["human"],
      prevIssueState: "OPEN",
    });
    expect(r.handled).toBe(false);
  });
});

describe("キューの排他", () => {
  test("同一リポジトリは 1 件ずつ、別リポジトリは並列", () => {
    const db = memDb();
    for (const [repo, n] of [
      ["o/a", 1],
      ["o/a", 2],
      ["o/b", 3],
    ] as const) {
      jobs.enqueueJob(db, {
        repo,
        issue_number: n,
        job_type: "implement",
        job_context: "c",
        trigger_key: `k${n}`,
      });
    }
    const j1 = jobs.fetchNextJob(db, 2, 1, "b");
    const j2 = jobs.fetchNextJob(db, 2, 1, "b");
    const j3 = jobs.fetchNextJob(db, 2, 1, "b");
    expect(j1?.repo).toBe("o/a");
    expect(j2?.repo).toBe("o/b"); // 同一 repo は詰まっているので別 repo が走る
    expect(j3).toBeNull(); // max_parallel = 2
  });

  test("リポジトリ横断で FIFO（先頭リポジトリが他を餓死させない）", () => {
    const db = memDb();
    jobs.enqueueJob(db, {
      repo: "o/b",
      issue_number: 1,
      job_type: "refine",
      job_context: "c",
      trigger_key: "k1",
    });
    jobs.enqueueJob(db, {
      repo: "o/a",
      issue_number: 2,
      job_type: "refine",
      job_context: "c",
      trigger_key: "k2",
    });
    expect(jobs.fetchNextJob(db, 4, 1, "b")?.repo).toBe("o/b");
  });

  test("同種の未完了ジョブは二重に積まれない", () => {
    const db = memDb();
    const a = jobs.enqueueJob(db, {
      repo: "o/r",
      issue_number: 1,
      job_type: "refine",
      job_context: "x",
      trigger_key: "k1",
    });
    const b = jobs.enqueueJob(db, {
      repo: "o/r",
      issue_number: 1,
      job_type: "refine",
      job_context: "y",
      trigger_key: "k2",
    });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    expect(jobs.getJob(db, a!)!.job_context).toContain("y"); // 文脈はマージされる
  });

  test("canceled も終端。同じ trigger_key では再投入しない（cancel が効く）", () => {
    const db = memDb();
    const id = jobs.enqueueJob(db, {
      repo: "o/r",
      issue_number: 1,
      job_type: "evaluate",
      job_context: "c",
      trigger_key: "ci:abc:SUCCESS",
    })!;
    jobs.finishJob(db, id, "canceled");
    const again = jobs.enqueueJob(db, {
      repo: "o/r",
      issue_number: 1,
      job_type: "evaluate",
      job_context: "c",
      trigger_key: "ci:abc:SUCCESS",
    });
    expect(again).toBeNull();
  });

  test("孤児回収は 3 回目で failed に確定し、runs を RUNNING のまま残さない", () => {
    const db = memDb();
    const id = jobs.enqueueJob(db, {
      repo: "o/r",
      issue_number: 1,
      job_type: "refine",
      job_context: "c",
      trigger_key: "k",
    })!;
    for (let i = 0; i < 3; i++) {
      jobs.fetchNextJob(db, 2, 1, "b");
      runsStore.startRun(db, {
        job_id: id,
        repo: "o/r",
        issue_number: 1,
        job_type: "refine",
        log_path: "l",
      });
      jobs.recoverOrphans(db, { onStartup: true });
      runsStore.endRun(db, id, "FAIL");
    }
    expect(jobs.getJob(db, id)!.status).toBe("failed");
    const stuck = db.query("SELECT COUNT(*) n FROM runs WHERE result='RUNNING'").get() as {
      n: number;
    };
    expect(stuck.n).toBe(0);
  });
});

describe("楽観ロックと Done ガード", () => {
  test("version が古い更新は弾かれる", () => {
    const db = memDb();
    const stale = seedItem(db, { repo: "o/r", issue_number: 1 });
    items.transitionItem(db, stale, { state: "Working", hint: "実装中" });
    expect(() => items.transitionItem(db, stale, { state: "Queued", hint: "着手待ち" })).toThrow(
      VersionConflict,
    );
  });

  test("Done は巻き戻らない（実行中に人間がクローズしたケース）", () => {
    const db = memDb();
    const it = seedItem(db, { repo: "o/r", issue_number: 1 });
    const done = items.transitionItem(db, it, { state: "Done", hint: "" });
    const after = items.transitionItem(db, done, { state: "Working", hint: "CI 待ち" });
    expect(after.state).toBe("Done");
  });

  test("助言待ち以外へ遷移すると blocked_from はクリアされる", () => {
    const db = memDb();
    const it = seedItem(db, { repo: "o/r", issue_number: 1 });
    const blocked = items.transitionItem(db, it, {
      state: "ActionRequired",
      hint: "助言待ち",
      blockedFrom: "implement",
    });
    expect(blocked.blocked_from).toBe("implement");
    const moved = items.transitionItem(db, blocked, { state: "Queued", hint: "着手待ち" });
    expect(moved.blocked_from).toBe("");
  });

  test("Poller は NULL の ci_since を埋めない（人間の push で CI 判定を開かない）", () => {
    const db = memDb();
    const it = seedItem(db, {
      repo: "o/r",
      issue_number: 1,
      pr_number: 10,
      head_sha: "old",
      ci_since: null,
    });
    items.refreshFromGitHub(db, it, { head_sha: "new" });
    expect(items.getItem(db, "o/r", 1)!.ci_since).toBeNull();
  });

  test("既に NOT NULL の ci_since は head_sha 変化でリセットされる", () => {
    const db = memDb();
    const it = seedItem(db, {
      repo: "o/r",
      issue_number: 1,
      pr_number: 10,
      head_sha: "old",
      ci_since: "2026-01-01T00:00:00Z",
    });
    items.refreshFromGitHub(db, it, { head_sha: "new" });
    const after = items.getItem(db, "o/r", 1)!;
    expect(after.ci_since).not.toBeNull();
    expect(after.ci_since).not.toBe("2026-01-01T00:00:00Z");
  });
});

describe("新規イベントの抽出", () => {
  test("インラインコメントも新規イベントに含む（レビュー本体は body が空になる）", () => {
    const db = memDb();
    const it = seedItem(db, {
      repo: "o/r",
      issue_number: 1,
      pr_number: 10,
      last_event_at: "",
      last_event_id: 0,
    });
    const p = pr({
      reviews: {
        nodes: [
          {
            databaseId: 1,
            state: "COMMENTED",
            body: "",
            submittedAt: "2026-08-24T01:00:00Z",
            author: { login: "human" },
          },
        ],
      },
      reviewThreads: {
        nodes: [
          {
            isResolved: false,
            comments: {
              nodes: [
                {
                  databaseId: 99,
                  body: "ここの文言を変えて",
                  path: "src/main.ts",
                  line: 42,
                  createdAt: "2026-08-24T01:00:01Z",
                  author: { login: "human" },
                },
              ],
            },
          },
        ],
      },
    });
    const evs = newEvents(it, issue(), p);
    expect(evs.map((e) => e.kind)).toContain("review_comment");
    expect(evs.find((e) => e.kind === "review_comment")?.body).toBe(
      "[src/main.ts:42] ここの文言を変えて",
    );
  });

  test("カーソルより古いものは拾わない、同時刻は databaseId で切る", () => {
    const db = memDb();
    const it = seedItem(db, {
      repo: "o/r",
      issue_number: 1,
      last_event_at: "2026-08-24T01:00:00Z",
      last_event_id: 50,
    });
    const i = issue({
      comments: {
        nodes: [
          {
            databaseId: 10,
            body: "old",
            createdAt: "2026-08-24T00:00:00Z",
            author: { login: "human" },
          },
          {
            databaseId: 50,
            body: "same",
            createdAt: "2026-08-24T01:00:00Z",
            author: { login: "human" },
          },
          {
            databaseId: 51,
            body: "new",
            createdAt: "2026-08-24T01:00:00Z",
            author: { login: "human" },
          },
        ],
      },
    });
    expect(newEvents(it, i, null).map((e) => e.body)).toEqual(["new"]);
  });
});

describe("親子の完了集約", () => {
  test("子が 0 件なら完了扱いにしない", () => {
    const db = memDb();
    const it = seedItem(db, {
      repo: "o/r",
      issue_number: 1,
      sub_issues_total: 0,
      sub_issues_completed: 0,
    });
    expect(aggregate(it, issue()).kind).toBe("unknown");
  });

  test("却下(NOT_PLANNED)を完了と区別する", () => {
    const db = memDb();
    const it = seedItem(db, {
      repo: "o/r",
      issue_number: 1,
      sub_issues_total: 2,
      sub_issues_completed: 2,
    });
    const i = issue({
      subIssues: {
        totalCount: 2,
        pageInfo: { hasNextPage: false },
        nodes: [
          {
            number: 11,
            state: "CLOSED",
            stateReason: "COMPLETED",
            repository: { nameWithOwner: "o/r" },
          },
          {
            number: 12,
            state: "CLOSED",
            stateReason: "NOT_PLANNED",
            repository: { nameWithOwner: "o/r" },
          },
        ],
      },
    });
    const r = aggregate(it, i);
    expect(r.kind).toBe("complete");
    if (r.kind === "complete") {
      expect(r.completed).toEqual([11]);
      expect(r.rejected).toEqual([12]);
    }
  });

  test("全部却下なら完了ではなく要判断", () => {
    const db = memDb();
    const it = seedItem(db, {
      repo: "o/r",
      issue_number: 1,
      sub_issues_total: 1,
      sub_issues_completed: 1,
    });
    const i = issue({
      subIssues: {
        totalCount: 1,
        pageInfo: { hasNextPage: false },
        nodes: [
          {
            number: 11,
            state: "CLOSED",
            stateReason: "NOT_PLANNED",
            repository: { nameWithOwner: "o/r" },
          },
        ],
      },
    });
    expect(aggregate(it, i).kind).toBe("all_rejected");
  });

  test("ページング中は内訳判定を行わない", () => {
    const db = memDb();
    const it = seedItem(db, {
      repo: "o/r",
      issue_number: 1,
      sub_issues_total: 60,
      sub_issues_completed: 60,
    });
    const i = issue({ subIssues: { totalCount: 60, pageInfo: { hasNextPage: true }, nodes: [] } });
    expect(aggregate(it, i).kind).toBe("unknown");
  });
});
