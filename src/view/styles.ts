/**
 * Dashboard CSS Styles
 */
export const styles = `
:root {
  --bg: #fbfbfa;
  --fg: #26241f;
  --muted: #7a756c;
  --line: #e6e3dd;
  --card: #fff;
  --warn: #a8442a;
  --accent: #3b82f6;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #191816;
    --fg: #e8e4dc;
    --muted: #98928a;
    --line: #2f2d29;
    --card: #211f1c;
    --warn: #e0a08a;
    --accent: #60a5fa;
  }
}
:root[data-theme="dark"] {
  --bg: #191816;
  --fg: #e8e4dc;
  --muted: #98928a;
  --line: #2f2d29;
  --card: #211f1c;
  --warn: #e0a08a;
  --accent: #60a5fa;
}
:root[data-theme="light"] {
  --bg: #fbfbfa;
  --fg: #26241f;
  --muted: #7a756c;
  --line: #e6e3dd;
  --card: #fff;
  --warn: #a8442a;
  --accent: #3b82f6;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 14px/1.6 ui-sans-serif, -apple-system, "Hiragino Sans", sans-serif;
}
header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 10px;
  align-items: center;
}
h1 {
  font-size: 15px;
  margin: 0;
  font-weight: 600;
  letter-spacing: .02em;
}
.header-link {
  margin-left: auto;
  color: var(--muted);
  font-size: 12px;
  text-decoration: none;
}
.header-link:hover {
  color: var(--fg);
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  line-height: 1;
  transition: color 0.15s ease;
}
.icon-btn:hover {
  color: var(--fg);
}
.banner {
  background: var(--warn);
  color: #fff;
  padding: 8px 20px;
  font-size: 13px;
}
main {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  padding: 20px;
  align-items: start;
}
section { min-width: 0; }
.card {
  position: relative;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
  transition: border-color 0.15s ease;
}
.card:hover { border-color: var(--muted); }
.by-repo details summary {
  text-transform: none;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}
.card.done .t {
  color: var(--muted);
}
.card.has-error {
  border-color: rgba(168, 68, 42, 0.35);
}
.card.has-error:hover {
  border-color: var(--warn);
}
.card.relation-active {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
}
.card.relation-target {
  border-color: var(--accent) !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35);
  animation: relation-pulse 1.2s infinite alternate ease-in-out;
}
@keyframes relation-pulse {
  from {
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
  }
  to {
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.55);
  }
}
.card-main {
  display: block;
  padding: 11px 13px;
  text-decoration: none;
  color: inherit;
}
.card-main:hover .t {
  color: var(--accent);
}
.t {
  font-weight: 500;
  margin-bottom: 4px;
  overflow-wrap: anywhere;
  padding-right: 32px;
  transition: color 0.15s ease;
}
.card:has(.card-history-btn) .t {
  padding-right: 72px;
}
.s {
  color: var(--muted);
  font-size: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.hint {
  font-weight: 500;
  color: var(--fg);
}
.card-sub {
  border-top: 1px dashed var(--line);
  padding: 6px 13px;
  background: rgba(120, 120, 120, 0.04);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  overflow: hidden;
}
.sub-connector {
  color: var(--muted);
  font-family: monospace;
  font-size: 12px;
  user-select: none;
  flex-shrink: 0;
}
.pr-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  text-decoration: none;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.08);
  transition: background 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
}
.pr-badge:hover {
  background: rgba(59, 130, 246, 0.18);
  text-decoration: underline;
}
.pr-badge svg {
  flex-shrink: 0;
}
.error-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--warn);
  text-decoration: none;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(168, 68, 42, 0.08);
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s ease, color 0.15s ease;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.error-badge:hover {
  background: rgba(168, 68, 42, 0.18);
  text-decoration: underline;
}
.error-badge svg {
  flex-shrink: 0;
}
.relation-badge-group {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.relation-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
  background: rgba(120, 120, 120, 0.08);
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid var(--line);
  cursor: default;
  user-select: none;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
}
.relation-badge svg {
  flex-shrink: 0;
}
.relation-badge.parent-badge {
  color: var(--fg);
  border-color: rgba(120, 120, 120, 0.25);
}
.relation-badge.child-badge {
  color: var(--muted);
}
.card-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 2;
}
.card-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 12px;
  padding: 2px 7px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s ease;
  line-height: 1.2;
  border: 1px solid var(--line);
}
.card-action-btn svg {
  flex-shrink: 0;
}
.card-history-btn {
  color: var(--muted);
  background: rgba(120, 120, 120, 0.08);
}
.card-history-btn:hover {
  background: var(--line);
  color: var(--fg);
  border-color: var(--muted);
}
.card-debug-btn {
  color: var(--accent);
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.25);
  padding: 3px 5px;
  border-radius: 6px;
}
.card-debug-btn:hover {
  background: rgba(59, 130, 246, 0.18);
  border-color: var(--accent);
  transform: translateY(-1px);
}
.header-chat-btn {
  color: var(--accent);
}
.header-chat-btn:hover {
  color: var(--fg);
  transform: scale(1.1);
}
.empty {
  color: var(--muted);
  font-size: 13px;
  padding: 6px 0;
}
details summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .08em;
  font-weight: 600;
  margin-bottom: 10px;
  user-select: none;
}
details summary:hover { color: var(--fg); }
.banner {
  background: var(--warn);
  color: #fff;
  padding: 8px 20px;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}
.banner:hover {
  filter: brightness(0.95);
}
.banner-tap-hint {
  font-size: 11px;
  opacity: 0.85;
  text-decoration: underline;
}

/* Modal Dialog */
dialog.modal {
  border: none;
  padding: 0;
  background: transparent;
  max-width: 100vw;
  max-height: 100vh;
}
dialog.modal::backdrop {
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}
.modal-box {
  background: var(--card);
  color: var(--fg);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 20px 24px;
  width: 440px;
  max-width: calc(100vw - 32px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}
.modal-header h2 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}
.close-btn {
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: var(--muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.close-btn:hover {
  color: var(--fg);
  background: var(--bg);
}
.modal-section {
  margin-bottom: 18px;
}
.modal-section:last-child {
  margin-bottom: 0;
}
.modal-section h3 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--muted);
  margin: 0 0 10px 0;
  font-weight: 600;
}
.rate-limit-cards {
  display: grid;
  gap: 10px;
}
.rate-card {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
}
.rate-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.rate-name {
  font-weight: 600;
  font-size: 13px;
}
.rate-val {
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--fg);
}
.progress-bar-bg {
  background: var(--line);
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}
.progress-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
  transition: width 0.3s ease, background 0.3s ease;
}
.progress-bar-fill.warn {
  background: var(--warn);
}
.rate-footer {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
}
.rate-reset {
  color: var(--fg);
  font-weight: 500;
}
.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin: 0;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
}
.status-grid dt {
  color: var(--muted);
  font-size: 11px;
  margin-bottom: 2px;
}
.status-grid dd {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
}
.status-full {
  grid-column: 1 / -1;
  border-top: 1px solid var(--line);
  padding-top: 6px;
  margin-top: 2px;
}
.error-modal-box {
  width: 540px;
}
.error-meta-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.error-issue-title {
  font-weight: 600;
  font-size: 14px;
  line-height: 1.4;
}
.error-badges-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11px;
}
.tag-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 500;
  background: var(--line);
  color: var(--fg);
}
.tag-badge.warn {
  background: rgba(168, 68, 42, 0.15);
  color: var(--warn);
}
.error-detail-box {
  background: var(--bg);
  border: 1px solid rgba(168, 68, 42, 0.3);
  border-left: 4px solid var(--warn);
  border-radius: 6px;
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--fg);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 220px;
}
.error-history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
}
.error-history-item {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 11px;
}
.error-history-header {
  display: flex;
  justify-content: space-between;
  color: var(--muted);
  font-weight: 500;
  margin-bottom: 4px;
}
.error-history-reason {
  color: var(--fg);
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
.history-modal-box {
  width: 620px;
}
.timeline {
  position: relative;
  padding-left: 24px;
  margin: 12px 0 6px 4px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.timeline::before {
  content: "";
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 7px;
  width: 2px;
  background: var(--line);
}
.timeline-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.timeline-marker {
  position: absolute;
  left: -24px;
  top: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--card);
  border: 2px solid var(--muted);
  box-sizing: border-box;
}
.timeline-marker.success {
  border-color: #10b981;
  background: #10b981;
}
.timeline-marker.fail {
  border-color: var(--warn);
  background: var(--warn);
}
.timeline-marker.blocked {
  border-color: #f59e0b;
  background: #f59e0b;
}
.timeline-marker.running {
  border-color: var(--accent);
  background: var(--card);
}
.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
}
.timeline-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.timeline-job-type {
  font-weight: 600;
  font-size: 13px;
  color: var(--fg);
}
.timeline-result {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}
.timeline-result.success {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}
.timeline-result.fail {
  background: rgba(168, 68, 42, 0.15);
  color: var(--warn);
}
.timeline-result.blocked {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}
.timeline-result.running {
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
}
.timeline-time-group {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 11px;
}
.timeline-duration {
  background: var(--bg);
  border: 1px solid var(--line);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: monospace;
}
.timeline-body {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.5;
}
.timeline-summary {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--fg);
  font-family: inherit;
}
.timeline-next-context {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed var(--line);
  color: var(--muted);
  font-size: 11px;
}
.timeline-empty {
  color: var(--muted);
  font-size: 12px;
  padding: 16px 0;
  text-align: center;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  text-decoration: none;
  border: 1px solid transparent;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.btn-primary {
  background: var(--fg);
  color: var(--bg);
}
.btn-primary:hover {
  opacity: 0.9;
}
.btn-secondary {
  background: var(--bg);
  border-color: var(--line);
  color: var(--fg);
}
.btn-secondary:hover {
  border-color: var(--muted);
}
.failed-jobs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
}
.failed-job-card {
  background: var(--bg);
  border: 1px solid rgba(168, 68, 42, 0.3);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 11px;
}
.failed-job-header {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 4px;
}
.failed-job-reason {
  color: var(--muted);
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
.relation-connector-svg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 800;
  overflow: visible;
}
.relation-path {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2.5px;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.85;
  filter: drop-shadow(0 2px 5px rgba(59, 130, 246, 0.4));
  stroke-dasharray: 6 3;
  animation: relation-dash 1s linear infinite;
}
@keyframes relation-dash {
  to {
    stroke-dashoffset: -18;
  }
}
.relation-dot {
  fill: var(--accent);
  stroke: var(--card);
  stroke-width: 2px;
}

/* ============================================================
 * Split Layout & AI Debug Chat Pane (Antigravity IDE Style)
 * ============================================================ */
.app-layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.main-pane {
  flex: 1;
  min-width: 320px;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

/* 分割リサイザー（スプリッター） */
.pane-resizer {
  width: 2px;
  height: 100vh;
  background: var(--line);
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  z-index: 50;
  transition: background 0.15s ease;
  user-select: none;
}
.pane-resizer:hover,
.pane-resizer.resizing {
  background: var(--accent);
}
.pane-resizer::after {
  content: "";
  position: absolute;
  top: 0;
  left: -4px;
  right: -4px;
  bottom: 0;
}

/* 右ペイン: チャットサイドパネル */
.chat-pane {
  position: relative;
  width: 460px;
  min-width: 300px;
  max-width: 75vw;
  height: 100vh;
  background: var(--card);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 40;
  font-size: 13px;
}

.chat-history-popover {
  position: absolute;
  top: 54px;
  right: 14px;
  width: 320px;
  max-height: 420px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  z-index: 50;
  overflow: hidden;
}

.chat-history-header {
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
  background: var(--bg);
}

.chat-history-list {
  overflow-y: auto;
  flex: 1;
}

.chat-history-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
}

.chat-history-item {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(120, 120, 120, 0.1);
  cursor: pointer;
  transition: background 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-history-item:hover {
  background: rgba(120, 120, 120, 0.08);
}

.chat-history-item.active {
  background: rgba(59, 130, 246, 0.08);
  border-left: 3px solid var(--accent);
}

.chat-history-item-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-history-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--muted);
}

.chat-history-badge {
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 10px;
  background: rgba(120, 120, 120, 0.12);
}

.chat-header {
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg);
  flex-shrink: 0;
}
.chat-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}
.chat-bot-icon {
  color: var(--accent);
  display: flex;
  align-items: center;
}
.chat-target-badge {
  background: rgba(59, 130, 246, 0.12);
  color: var(--accent);
  font-size: 11px;
  font-family: ui-monospace, monospace;
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid rgba(59, 130, 246, 0.25);
  font-weight: 500;
}
.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.chat-header-action-btn {
  background: rgba(120, 120, 120, 0.08);
  border: 1px solid var(--line);
  color: var(--muted);
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  transition: all 0.15s ease;
}
.chat-header-action-btn:hover {
  color: var(--fg);
  border-color: var(--accent);
  background: var(--card);
}
.chat-close-btn {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: color 0.15s ease, background 0.15s ease;
}
.chat-close-btn:hover {
  color: var(--fg);
  background: var(--line);
}

.chat-context-bar {
  padding: 8px 16px;
  background: rgba(120, 120, 120, 0.05);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  flex-shrink: 0;
}
.context-info {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.context-label {
  color: var(--muted);
  font-weight: 500;
  flex-shrink: 0;
}
.context-desc {
  color: var(--fg);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
}
.context-refresh-btn {
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.context-refresh-btn:hover {
  color: var(--fg);
  border-color: var(--muted);
  background: var(--line);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-welcome-msg {
  text-align: center;
  padding: 30px 20px;
  color: var(--muted);
}
.chat-welcome-msg .welcome-icon {
  display: inline-flex;
  padding: 12px;
  background: rgba(59, 130, 246, 0.1);
  color: var(--accent);
  border-radius: 50%;
  margin-bottom: 16px;
}
.chat-welcome-msg h4 {
  margin: 0 0 8px;
  color: var(--fg);
  font-size: 15px;
}
.chat-welcome-msg p {
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 16px;
}
.chat-quick-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 280px;
  margin: 0 auto;
}

.chat-msg {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 100%;
}
.chat-msg.user {
  align-self: flex-end;
}
.chat-msg.assistant {
  align-self: flex-start;
  width: 100%;
}

.msg-bubble {
  padding: 10px 14px;
  border-radius: 10px;
  line-height: 1.55;
  word-break: break-word;
}
.chat-msg.user .msg-bubble {
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 2px;
  max-width: 85%;
}
.chat-msg.assistant .msg-bubble {
  background: var(--bg);
  border: 1px solid var(--line);
  color: var(--fg);
  border-bottom-left-radius: 2px;
}
.msg-bubble pre {
  background: rgba(0, 0, 0, 0.05);
  padding: 10px;
  border-radius: 6px;
  overflow-x: auto;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
.msg-bubble code {
  font-family: ui-monospace, monospace;
  background: rgba(120, 120, 120, 0.12);
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 12px;
}
.msg-bubble blockquote {
  margin: 8px 0;
  padding-left: 10px;
  border-left: 3px solid var(--accent);
  color: var(--muted);
}
.msg-bubble h3 {
  margin: 6px 0 10px;
  font-size: 14px;
}
.msg-bubble ul, .msg-bubble ol {
  margin: 6px 0;
  padding-left: 20px;
}
.msg-bubble p {
  margin: 6px 0;
}

/* 思考プロセス (Thinking / CoT) */
.thinking-accordion {
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: rgba(120, 120, 120, 0.04);
  padding: 8px 12px;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 6px;
}
.thinking-accordion summary {
  cursor: pointer;
  user-select: none;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  outline: none;
}
.thinking-accordion summary:hover {
  color: var(--fg);
}
.thinking-content {
  margin: 8px 0 0;
  padding: 6px 0 0;
  border-top: 1px dotted var(--line);
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted);
  max-height: 180px;
  overflow-y: auto;
}

/* ツール呼び出しログ (Tool Calls) */
.tool-call-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}
.tool-call-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 4px 10px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-family: ui-monospace, monospace;
  color: var(--fg);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}
.tool-call-badge .tool-icon {
  font-size: 12px;
}
.tool-call-badge .tool-status {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: auto;
  font-weight: 600;
}
.tool-call-badge .tool-status.running {
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
}
.tool-call-badge .tool-status.done {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

/* クイックチップス */
.chat-quick-bar {
  padding: 8px 16px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  border-top: 1px solid var(--line);
  background: var(--bg);
  flex-shrink: 0;
}
.quick-chip {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--fg);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  font-family: inherit;
}
.quick-chip:hover {
  background: var(--line);
  border-color: var(--muted);
  transform: translateY(-1px);
}

/* Antigravity IDE 風 Composer (入力エリア) */
.chat-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--line);
  background: var(--bg);
  flex-shrink: 0;
}

.agy-composer {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}

.agy-composer:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), 0 2px 8px rgba(59, 130, 246, 0.12);
}

/* アタッチされたコンテキストチップ (Mention Chips) */
.agy-context-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.agy-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 6px;
  padding: 2px 7px;
  font-size: 11px;
  font-family: ui-monospace, monospace;
  color: var(--fg);
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}

.agy-chip:hover {
  background: rgba(59, 130, 246, 0.18);
  border-color: var(--accent);
}

.agy-chip.error-chip {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.25);
  color: #ef4444;
}

.agy-chip.error-chip:hover {
  background: rgba(239, 68, 68, 0.18);
  border-color: #ef4444;
}

.agy-chip .chip-icon {
  display: flex;
  align-items: center;
  color: var(--accent);
}

.agy-chip.error-chip .chip-icon {
  color: #ef4444;
}

.agy-chip .chip-text {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.agy-chip .chip-close {
  background: transparent;
  border: none;
  padding: 0;
  margin-left: 2px;
  cursor: pointer;
  color: var(--muted);
  display: flex;
  align-items: center;
  border-radius: 50%;
  transition: color 0.15s ease;
}

.agy-chip .chip-close:hover {
  color: var(--fg);
}

/* テキストエリア */
.agy-textarea {
  border: none;
  background: transparent;
  color: var(--fg);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.45;
  resize: none;
  outline: none;
  width: 100%;
  min-height: 26px;
  max-height: 140px;
  padding: 0;
}

.agy-textarea::placeholder {
  color: var(--muted);
  opacity: 0.8;
}

/* 下部ツールバー */
.agy-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 2px;
}

.agy-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* モード・エンジン切り替えセレクト (Antigravity IDE Style) */
.agy-mode-picker,
.agy-engine-picker {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 26px;
  background: rgba(120, 120, 120, 0.08);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0 24px 0 9px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-sizing: border-box;
}

.agy-mode-picker:hover,
.agy-engine-picker:hover {
  background: var(--line);
  border-color: var(--muted);
}

.chat-mode-select,
.agy-engine-select {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: none;
  color: var(--fg);
  font-size: 11px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  padding: 0;
  height: 100%;
  line-height: 24px;
}

.chat-mode-select option,
.agy-engine-select option {
  background: var(--card);
  color: var(--fg);
}

.agy-picker-arrow {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--muted);
  display: flex;
  align-items: center;
}

.agy-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Antigravity IDE 風の丸型送信ボタン */
.agy-send-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #007acc;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease, opacity 0.15s ease;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 122, 204, 0.3);
}

.agy-send-btn:hover {
  background: #0088e0;
  transform: scale(1.05);
}

.agy-send-btn:active {
  transform: scale(0.95);
}

.agy-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

/* メッセージ内のコンテキストピン */
.msg-context-pin {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-family: ui-monospace, monospace;
  background: rgba(120, 120, 120, 0.1);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--muted);
  margin-bottom: 4px;
  align-self: flex-start;
}

/* Issue ドラフトプレビューカード */
.issue-draft-card {
  margin-top: 14px;
  padding: 14px 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.issue-draft-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.issue-draft-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  display: flex;
  align-items: center;
  gap: 4px;
}
.issue-draft-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--fg);
}
.issue-draft-repo {
  font-size: 11px;
  color: var(--muted);
  font-family: ui-monospace, monospace;
  margin-bottom: 12px;
}
.issue-create-action {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.issue-create-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.1s ease;
}
.issue-create-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}
.issue-create-btn:active {
  transform: translateY(0);
}
.issue-create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.issue-created-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}
.issue-created-badge:hover {
  text-decoration: underline;
}

/* ボタン化した要素のブラウザ既定スタイルを打ち消す */
button.banner,
button.chat-history-item {
  width: 100%;
  border: none;
  font: inherit;
  text-align: left;
}
button.banner {
  color: #fff;
}
button.chat-history-item {
  background: none;
  color: inherit;
  border-bottom: 1px solid rgba(120, 120, 120, 0.1);
}
.banner-static {
  cursor: default;
}
.rate-val-warn {
  color: var(--warn);
  font-size: 11px;
}
.system-degraded-list {
  margin-bottom: 14px;
}
.history-timeline-section {
  max-height: 420px;
  overflow-y: auto;
  padding-right: 4px;
}
.chat-error {
  color: var(--warn);
  margin-top: 8px;
}
.issue-draft-content {
  margin: 10px 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--fg);
  opacity: 0.9;
}
.issue-draft-content h3 {
  font-size: 12px;
  margin: 10px 0 4px;
}
.issue-create-error {
  color: var(--warn);
  font-size: 11px;
  margin-top: 4px;
}
.md-task {
  list-style: none;
  margin-left: -16px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.md-task-box {
  color: var(--muted);
}
.md-task-box.checked {
  color: var(--accent);
}
`;
