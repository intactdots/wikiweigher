export const STYLES = `
.cx-card, .cx-pill {
  font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; letter-spacing: -0.05px; box-sizing: border-box;
  --cx-acc: #0078d4;
  --cv:#ffffff; --s1:#f5f6f8; --s2:#eceef1; --ink:#14161b; --imut:#2b3038; --mut:#666c76; --sub:#969ca6;
  --line:#e3e5ea; --line2:#cfd2d9; --ok:#1f9a3c; --warn:#b3781c;
  --acc2: color-mix(in srgb, var(--cx-acc), #000000 6%);
  --acc-soft: color-mix(in srgb, var(--cx-acc) 12%, transparent);
  --acc-line: color-mix(in srgb, var(--cx-acc) 38%, transparent);
  --shadow: 0 10px 34px rgba(15,18,26,.16), 0 2px 8px rgba(15,18,26,.08);
}
@media (prefers-color-scheme: dark) {
  .cx-card:not([data-theme="light"]), .cx-pill:not([data-theme="light"]) {
    --cv:#0f1011; --s1:#141516; --s2:#18191a; --ink:#f7f8f8; --imut:#d0d6e0; --mut:#8a8f98; --sub:#62666d;
    --line:#23252a; --line2:#34343a; --ok:#27a644; --warn:#e5a33d;
    --acc2: color-mix(in srgb, var(--cx-acc), #ffffff 45%);
    --shadow: 0 16px 44px rgba(0,0,0,.55), 0 2px 10px rgba(0,0,0,.45);
  }
}
.cx-card[data-theme="dark"], .cx-pill[data-theme="dark"] {
  --cv:#0f1011; --s1:#141516; --s2:#18191a; --ink:#f7f8f8; --imut:#d0d6e0; --mut:#8a8f98; --sub:#62666d;
  --line:#23252a; --line2:#34343a; --ok:#27a644; --warn:#e5a33d;
  --acc2: color-mix(in srgb, var(--cx-acc), #ffffff 45%);
  --shadow: 0 16px 44px rgba(0,0,0,.55), 0 2px 10px rgba(0,0,0,.45);
}
.cx-card * { box-sizing: border-box; }
.cx-card { width: 306px; background:var(--cv); color:var(--ink); border:1px solid var(--line); border-radius:14px; overflow:hidden; box-shadow:var(--shadow); font-size:13px; }
.cx-head { display:flex; align-items:center; gap:8px; padding:11px 13px; background:var(--s1); border-bottom:1px solid var(--line); cursor:grab; user-select:none; touch-action:none; }
.cx-head:active { cursor:grabbing; }
.cx-head-title { display:inline-flex; align-items:center; gap:7px; font-weight:600; font-size:13px; letter-spacing:-0.2px; }
.cx-head-title svg { color:var(--cx-acc); }
.cx-spacer { flex:1; }
.cx-icon-btn { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; padding:0; border:none; background:none; color:var(--sub); cursor:pointer; border-radius:6px; }
.cx-icon-btn:hover { background:var(--s2); color:var(--ink); }
.cx-best { padding:14px 15px; border-bottom:1px solid var(--line); }
.cx-best-label { font-size:10px; letter-spacing:.5px; text-transform:uppercase; color:var(--cx-acc); font-weight:700; }
.cx-best-main { display:flex; align-items:baseline; gap:7px; margin-top:5px; flex-wrap:wrap; }
.cx-best-name { font-size:17px; font-weight:650; letter-spacing:-0.3px; color:var(--ink); }
.cx-best-en { font-size:11px; color:var(--sub); }
.cx-open { display:inline-flex; align-items:center; gap:4px; border:none; background:none; color:var(--cx-acc); cursor:pointer; font-size:12px; font-weight:600; padding:0; font-family:inherit; }
.cx-open svg { width:13px; height:13px; }
.cx-best-reason { font-size:11.5px; color:var(--mut); margin-top:5px; }
.cx-translate { display:inline-flex; align-items:center; gap:6px; margin-top:11px; padding:6px 11px; border:1px solid var(--line2); background:var(--cv); color:var(--cx-acc); border-radius:8px; cursor:pointer; font-size:11.5px; font-weight:500; font-family:inherit; }
.cx-translate:hover { background:var(--s1); }
.cx-translate svg { width:13px; height:13px; }
.cx-sourced { display:flex; align-items:center; gap:7px; margin-top:12px; padding:9px 11px; border-radius:9px; background:var(--acc-soft); flex-wrap:wrap; }
.cx-sourced-icon { display:inline-flex; color:var(--cx-acc); }
.cx-sourced-icon svg { width:13px; height:13px; }
.cx-sourced-label { font-size:9.5px; letter-spacing:.5px; text-transform:uppercase; color:var(--mut); font-weight:700; }
.cx-sourced-link { display:inline-flex; align-items:center; gap:4px; border:none; background:none; color:var(--acc2); cursor:pointer; font-size:12px; padding:0; font-family:inherit; font-weight:650; }
.cx-sourced-link svg { width:12px; height:12px; }
.cx-loading { padding:16px 15px; color:var(--mut); font-size:12px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:9px; }
.cx-loading::before { content:""; width:13px; height:13px; border-radius:50%; border:2px solid var(--line2); border-top-color:var(--cx-acc); animation:cxspin .7s linear infinite; flex:none; }
@keyframes cxspin { to { transform:rotate(360deg); } }
.cx-colhead { display:flex; align-items:center; padding:10px 14px 4px; font-size:9.5px; letter-spacing:.5px; text-transform:uppercase; color:var(--sub); font-weight:600; }
.cx-colhead-stat { width:82px; text-align:right; }
.cx-rows { padding:8px 8px 10px 14px; display:flex; flex-direction:column; gap:2px; max-height:236px; overflow-y:auto; overflow-x:hidden; scrollbar-width:thin; scrollbar-color:var(--line2) transparent; }
.cx-rows::-webkit-scrollbar { width:8px; }
.cx-rows::-webkit-scrollbar-track { background:transparent; }
.cx-rows::-webkit-scrollbar-thumb { background:var(--line2); border-radius:10px; border:2px solid transparent; background-clip:padding-box; }
.cx-rows::-webkit-scrollbar-thumb:hover { background:var(--mut); background-clip:padding-box; }
.cx-row { display:flex; align-items:center; gap:9px; border:none; background:none; padding:6px 6px; margin:0 6px 0 0; border-radius:8px; cursor:pointer; text-align:left; color:inherit; font:inherit; }
.cx-row:hover { background:var(--s1); }
.cx-row-name { width:104px; display:flex; align-items:center; gap:6px; overflow:hidden; font-size:12px; color:var(--imut); }
.cx-name-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cx-you { font-size:9px; font-weight:600; background:var(--acc-soft); color:var(--acc2); border-radius:4px; padding:1px 5px; flex:none; text-transform:uppercase; letter-spacing:.3px; }
.cx-badge { font-size:11px; flex:none; line-height:1; }
.cx-badge-featured { color:#eab308; }
.cx-badge-good { color:var(--sub); }
.cx-bar { flex:1; height:6px; background:var(--s2); border-radius:4px; overflow:hidden; }
.cx-bar-fill { display:block; height:100%; background:var(--cx-acc); border-radius:4px; }
.cx-row.cx-current { background:var(--acc-soft); }
.cx-row.cx-top .cx-bar-fill { background:var(--cx-acc); }
.cx-row-stat { width:82px; text-align:right; font-size:11px; color:var(--mut); flex:none; font-variant-numeric:tabular-nums; }
.cx-row:hover .cx-row-name { color:var(--cx-acc); }
.cx-card :focus-visible, .cx-pill:focus-visible { outline:2px solid var(--cx-acc); outline-offset:2px; border-radius:7px; }
@media (prefers-reduced-motion: reduce) {
  .cx-loading::before { animation:none; opacity:.55; }
  .cx-card, .cx-pill, .cx-row, .cx-open, .cx-translate, .cx-error-btn { transition:none !important; }
}
@media (forced-colors: active) {
  .cx-card, .cx-pill { border:1px solid CanvasText; }
  .cx-bar-fill { background:Highlight; }
}
.cx-error { padding:14px 15px 13px; border-bottom:1px solid var(--line); }
.cx-error-head { display:flex; align-items:center; gap:8px; color:var(--warn); font-size:12px; font-weight:600; }
.cx-error-msg { margin:7px 0 11px; color:var(--imut); font-size:12px; line-height:1.5; }
.cx-error-acts { display:flex; gap:8px; }
.cx-error-btn { border:1px solid var(--line2); background:var(--s2); color:var(--imut); cursor:pointer; font-size:11.5px; font-weight:600; padding:6px 12px; font-family:inherit; border-radius:7px; }
.cx-error-btn:hover { background:var(--s1); border-color:var(--cx-acc); }
.cx-error-btn.cx-error-pri { background:var(--cx-acc); border-color:var(--cx-acc); color:#fff; }
.cx-error-btn.cx-error-pri:hover { filter:brightness(1.1); }
.cx-rate { display:flex; align-items:center; gap:7px; margin:2px 10px 8px; padding:8px 10px; border-radius:9px; background:var(--acc-soft); font-size:11.5px; }
.cx-rate-star { color:var(--cx-acc); font-size:12px; }
.cx-rate-text { flex:1; color:var(--imut); font-weight:500; }
.cx-rate-btn { border:none; background:none; color:var(--acc2); cursor:pointer; font-size:11.5px; font-weight:600; padding:2px 4px; font-family:inherit; border-radius:5px; }
.cx-rate-btn:hover { background:var(--s2); }
.cx-rate-btn.cx-rate-pri { color:var(--cx-acc); }
.cx-rate-x { width:20px; height:20px; }
.cx-foot { display:flex; align-items:center; gap:6px; padding:9px 14px; border-top:1px solid var(--line); background:var(--s1); }
.cx-foot-note { font-size:10px; color:var(--sub); }
.cx-pill { display:inline-flex; align-items:center; gap:8px; background:var(--s1); border:1px solid var(--line); border-radius:20px; padding:8px 14px; cursor:grab; color:var(--ink); box-shadow:var(--shadow); font-size:12px; font-weight:500; user-select:none; touch-action:none; }
.cx-pill:active { cursor:grabbing; }
.cx-pill svg { color:var(--cx-acc); width:15px; height:15px; }
`;
