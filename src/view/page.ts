/**
 * SPA 資産はバイナリに埋め込み、別途のファイル配置を不要にする。
 * ビルド工程を増やさないため、単一の HTML 文字列として持つ。
 */
export const PAGE = `<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Autopilot</title>
<style>
:root{--bg:#fbfbfa;--fg:#26241f;--muted:#7a756c;--line:#e6e3dd;--card:#fff;--warn:#a8442a}
@media (prefers-color-scheme:dark){:root{--bg:#191816;--fg:#e8e4dc;--muted:#98928a;--line:#2f2d29;--card:#211f1c;--warn:#e0a08a}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 ui-sans-serif,-apple-system,"Hiragino Sans",sans-serif}
header{padding:16px 20px;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:baseline}
h1{font-size:15px;margin:0;font-weight:600;letter-spacing:.02em}
.meta{color:var(--muted);font-size:12px}
.banner{background:var(--warn);color:#fff;padding:8px 20px;font-size:13px}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;padding:20px;align-items:start}
section{min-width:0}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 10px;font-weight:600}
a.card{display:block;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:11px 13px;margin-bottom:8px;text-decoration:none;color:inherit}
a.card:hover{border-color:var(--muted)}
.t{font-weight:500;margin-bottom:4px;overflow-wrap:anywhere}
.s{color:var(--muted);font-size:12px;display:flex;gap:8px;flex-wrap:wrap}
.hint{font-weight:500;color:var(--fg)}
.empty{color:var(--muted);font-size:13px;padding:6px 0}
details summary{cursor:pointer;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-bottom:10px}
</style></head><body>
<header><h1>Autopilot</h1><span class="meta" id="meta"></span></header>
<div id="banner"></div>
<main>
  <section><h2>🧑 Action Required</h2><div id="action_required"></div></section>
  <section><h2>🤖 Working</h2><div id="working"></div></section>
  <section><h2>📦 Queued</h2><div id="queued"></div></section>
  <section><details><summary>📥 Backlog</summary><div id="backlog"></div></details></section>
</main>
<script>
const ago = t => { if(!t) return ""; const m = Math.floor((Date.now()-Date.parse(t))/60000);
  return m<1?"たった今":m<60?m+"分":m<1440?Math.floor(m/60)+"時間":Math.floor(m/1440)+"日"; };
function render(lane, cards){
  const el = document.getElementById(lane);
  if(!cards.length){ el.innerHTML = '<div class="empty">なし</div>'; return; }
  el.innerHTML = cards.map(c => {
    const bits = [c.repo+"#"+c.issue_number];
    if(c.queue_position) bits.push(c.queue_position+"番目");
    if(c.job_type) bits.push(c.job_type+" "+ago(c.started_at));
    else bits.push(ago(c.state_since));
    return '<a class="card" href="'+c.url+'" target="_blank" rel="noreferrer">'
      + '<div class="t">'+esc(c.title||"(no title)")+'</div>'
      + '<div class="s"><span class="hint">'+esc(c.display_hint)+'</span><span>'+bits.map(esc).join(" · ")+'</span></div></a>';
  }).join("");
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function refresh(){
  try{
    const r = await fetch("/api/state"); const s = await r.json();
    for(const k of ["action_required","working","queued","backlog"]) render(k, s.lanes[k]||[]);
    document.getElementById("meta").textContent =
      "GraphQL " + s.health.graphql_remaining + " · 実行中 " + s.health.running_jobs;
    document.getElementById("banner").innerHTML =
      s.health.degraded.length ? '<div class="banner">'+s.health.degraded.map(esc).join(" / ")+'</div>' : "";
  }catch(e){
    document.getElementById("banner").innerHTML = '<div class="banner">autopilot に接続できません</div>';
  }
}
refresh(); let t=setInterval(refresh,4000);
document.addEventListener("visibilitychange",()=>{ clearInterval(t); if(!document.hidden){ refresh(); t=setInterval(refresh,4000);} });
</script></body></html>`;
