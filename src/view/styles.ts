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
.meta {
  color: var(--muted);
  font-size: 12px;
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
.card.has-error {
  border-color: rgba(168, 68, 42, 0.35);
}
.card.has-error:hover {
  border-color: var(--warn);
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
  padding-right: 38px;
  transition: color 0.15s ease;
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
.card-history-btn {
  position: absolute;
  top: 9px;
  right: 9px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
  background: rgba(120, 120, 120, 0.08);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 2px 7px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  z-index: 2;
  line-height: 1.2;
}
.card-history-btn:hover {
  background: var(--line);
  color: var(--fg);
  border-color: var(--muted);
}
.card-history-btn svg {
  flex-shrink: 0;
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
`;
