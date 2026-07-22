export const UI = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Form filler</title>
<style>
  :root {
    --ink: #0d1014;
    --panel: #14181e;
    --rule: #222831;
    --text: #cdd4dd;
    --dim: #6e7885;
    --amber: #e9a13b;
    --green: #57be8c;
    --red: #e0675e;
    --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--ink); color: var(--text);
    font-family: var(--mono); font-size: 13px; line-height: 1.5;
  }
  .shell { display: grid; grid-template-columns: 380px 1fr; height: 100dvh; }
  @media (max-width: 900px) { .shell { grid-template-columns: 1fr; grid-template-rows: auto 1fr; height: auto; } }

  .side { border-right: 1px solid var(--rule); display: flex; flex-direction: column; min-height: 0; }
  .head { padding: 20px; border-bottom: 1px solid var(--rule); }
  .eyebrow {
    font-size: 10px; letter-spacing: .18em; text-transform: uppercase;
    color: var(--dim); margin: 0 0 14px;
  }
  h1 { font-size: 15px; font-weight: 500; margin: 0 0 16px; letter-spacing: -.01em; }

  label { display: block; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); margin-bottom: 6px; }
  input[type=text] {
    width: 100%; padding: 9px 10px; background: var(--panel); color: var(--text);
    border: 1px solid var(--rule); border-radius: 2px; font: inherit;
  }
  input[type=text]:focus-visible, button:focus-visible, .check:focus-within {
    outline: 2px solid var(--amber); outline-offset: 1px;
  }
  .row { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
  button {
    padding: 9px 16px; background: var(--amber); color: #16120a; border: 0;
    border-radius: 2px; font: inherit; font-weight: 600; cursor: pointer;
  }
  button:disabled { background: var(--rule); color: var(--dim); cursor: default; }
  .check { display: flex; align-items: center; gap: 6px; color: var(--dim); font-size: 12px; }

  /* telemetry rail — the log is the point of this screen, so it gets the space */
  .log { flex: 1; overflow-y: auto; padding: 16px 20px 40px; min-height: 220px; }
  .entry {
    display: grid; grid-template-columns: 52px 10px 1fr; gap: 10px;
    padding: 5px 0; align-items: baseline;
  }
  .t { color: #444d59; font-size: 11px; font-variant-numeric: tabular-nums; }
  .node { position: relative; align-self: stretch; }
  .node::before {
    content: ""; position: absolute; left: 3px; top: 7px;
    width: 5px; height: 5px; background: var(--dim);
  }
  .node::after {
    content: ""; position: absolute; left: 5px; top: 12px; bottom: -5px; width: 1px; background: var(--rule);
  }
  .entry:last-child .node::after { display: none; }
  .entry.ok .node::before { background: var(--green); }
  .entry.err .node::before { background: var(--red); }
  .entry.err .msg { color: var(--red); }
  .msg { word-break: break-word; }
  .msg b { font-weight: 600; color: #fff; }
  .msg .val { color: var(--amber); }

  .stage { display: flex; flex-direction: column; min-height: 0; background: var(--panel); }
  .bar {
    display: flex; align-items: center; gap: 10px; padding: 10px 16px;
    border-bottom: 1px solid var(--rule); font-size: 11px; color: var(--dim);
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--rule); }
  .dot.live { background: var(--green); }
  @media (prefers-reduced-motion: no-preference) {
    .dot.live { animation: pulse 1.8s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: .35; } }
  }
  .frame { flex: 1; border: 0; width: 100%; background: #000; min-height: 60vh; }
  .empty { flex: 1; display: grid; place-items: center; color: var(--dim); padding: 40px; text-align: center; }
</style>
</head>
<body>
<div class="shell">
  <aside class="side">
    <div class="head">
      <p class="eyebrow">Browser Run · live session</p>
      <h1>Fill a contact form</h1>
      <label for="url">Site to open</label>
      <input id="url" type="text" value="https://example.com" spellcheck="false" autocapitalize="off">
      <div class="row">
        <button id="go">Run</button>
        <span class="check"><input id="submit" type="checkbox"> <label for="submit" style="margin:0;text-transform:none;letter-spacing:0;font-size:12px">Click submit</label></span>
      </div>
    </div>
    <div class="log" id="log">
      <div class="entry"><span class="t">--:--</span><span class="node"></span><span class="msg">Enter a URL and press Run.</span></div>
    </div>
  </aside>

  <main class="stage">
    <div class="bar"><span class="dot" id="dot"></span><span id="status">No session</span></div>
    <div class="empty" id="empty">The browser appears here once the session starts.</div>
    <iframe class="frame" id="frame" style="display:none" allow="clipboard-read; clipboard-write"></iframe>
  </main>
</div>

<script>
const $ = (id) => document.getElementById(id);
const log = $("log"), go = $("go"), frame = $("frame"), empty = $("empty"), dot = $("dot"), status = $("status");
let started = 0;

function line(html, cls) {
  const el = document.createElement("div");
  el.className = "entry " + (cls || "");
  const secs = started ? ((Date.now() - started) / 1000).toFixed(1) + "s" : "0.0s";
  el.innerHTML = '<span class="t">' + secs + '</span><span class="node"></span><span class="msg">' + html + "</span>";
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

go.onclick = () => {
  const url = $("url").value.trim();
  if (!url) return;
  log.innerHTML = "";
  started = Date.now();
  go.disabled = true;
  frame.style.display = "none";
  empty.style.display = "grid";
  dot.className = "dot";
  status.textContent = "Connecting";

  const qs = new URLSearchParams({ url });
  if ($("submit").checked) qs.set("submit", "1");
  const es = new EventSource("/run?" + qs.toString());

  es.addEventListener("live", (e) => {
    const d = JSON.parse(e.data);
    if (d.url) {
      frame.src = d.url;
      frame.style.display = "block";
      empty.style.display = "none";
      dot.className = "dot live";
      status.textContent = "Live · " + d.sessionId.slice(0, 8);
    } else {
      status.textContent = "Session " + d.sessionId.slice(0, 8) + " (no live view URL)";
    }
    line("Live view attached");
  });

  es.addEventListener("step", (e) => line(esc(JSON.parse(e.data).msg)));

  es.addEventListener("fields", (e) => {
    const d = JSON.parse(e.data);
    line("Found <b>" + d.count + "</b> fillable field" + (d.count === 1 ? "" : "s"));
    d.fields.forEach((f) =>
      line('<span class="val">' + esc(f.selector) + "</span> " + esc(f.label || f.placeholder || f.name || f.type)),
    );
  });

  es.addEventListener("filled", (e) => {
    const d = JSON.parse(e.data);
    line(esc(d.selector) + ' &rarr; <span class="val">' + esc(d.value.slice(0, 60)) + "</span>", "ok");
  });

  es.addEventListener("done", (e) => line("Submitted. Now at " + esc(JSON.parse(e.data).url), "ok"));

  es.addEventListener("error", (e) => {
    try { line(esc(JSON.parse(e.data).message), "err"); } catch { line("Connection dropped.", "err"); }
  });

  es.addEventListener("end", () => {
    es.close();
    go.disabled = false;
    status.textContent = "Session finished";
    dot.className = "dot";
  });

  es.onerror = () => { es.close(); go.disabled = false; };
};
</script>
</body>
</html>`;
