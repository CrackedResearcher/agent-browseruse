import puppeteer from "@cloudflare/puppeteer";
import { createSession } from "./session";
import { planFills, type FillAction } from "./dummy";
import type { Env, FieldDescriptor, Send, SubmitDescriptor } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RunOptions {
  env: Env;
  target: string;
  /** Off by default. You do not want to be posting to real inboxes while debugging. */
  submit: boolean;
  send: Send;
}

export async function runTask({ env, target, submit, send }: RunOptions) {
  await send("step", { msg: "Starting a browser session" });
  const { sessionId, liveUrl } = await createSession(env);
  await send("live", { url: liveUrl, sessionId });

  const browser = await puppeteer.connect(env.BROWSER, sessionId);

  try {
    const existing = await browser.pages();
    const page = existing[0] ?? (await browser.newPage());
    await page.setViewport({ width: 1280, height: 800 });

    await send("step", { msg: `Opening ${target}` });
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(1200); // let the viewer actually see the landing page

    // --- find the contact page -------------------------------------------
    let contactUrl: string | null = await page.evaluate(FIND_CONTACT_LINK);

    if (contactUrl && contactUrl !== page.url()) {
      await send("step", { msg: `Following contact link: ${contactUrl}` });
      await page.goto(contactUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await sleep(1200);
    } else {
      await send("step", { msg: "No contact link found — looking for a form on this page" });
    }

    await dismissConsentBanner(page);

    // --- collect fields across every frame --------------------------------
    const frames = page.frames();
    const fields: FieldDescriptor[] = [];
    const submits: SubmitDescriptor[] = [];

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (!frame.url() || frame.url() === "about:blank") continue;
      try {
        const found: any = await frame.evaluate(COLLECT_FIELDS);
        for (const f of found.fields) fields.push({ ...f, frame: i });
        for (const s of found.submits) submits.push({ ...s, frame: i });
      } catch {
        // cross-origin frame we can't touch, or it navigated mid-read
      }
    }

    await send("fields", { count: fields.length, fields });

    if (fields.length === 0) {
      await send("step", { msg: "No fillable fields found. Stopping here." });
      return;
    }

    // --- decide what to type ----------------------------------------------
    // Step 4 swaps this one line for a Gemini call returning the same shape.
    const actions: FillAction[] = planFills(fields);
    await send("plan", { actions });

    // --- type it ------------------------------------------------------------
    for (const a of actions) {
      const frame = frames[a.frame];
      try {
        const el = await frame.$(a.selector);
        if (!el) {
          await send("step", { msg: `Skipped, element gone: ${a.selector}` });
          continue;
        }
        await el.evaluate((e: any) => e.scrollIntoView({ block: "center", behavior: "smooth" }));
        await sleep(250);

        if (a.action === "select") {
          await frame.select(a.selector, a.value);
        } else if (a.action === "check") {
          await el.click();
        } else {
          await el.click({ clickCount: 3 }); // select existing text, then overwrite
          await el.type(a.value, { delay: 25 }); // delay so the viewer sees typing
        }
        await send("filled", { selector: a.selector, value: a.value });
        await sleep(200);
      } catch (err: any) {
        await send("step", { msg: `Could not fill ${a.selector}: ${err?.message ?? err}` });
      }
    }

    // --- submit --------------------------------------------------------------
    if (!submit) {
      await send("step", { msg: "Filled. Submit is off — add &submit=1 to send it." });
      return;
    }

    const button = submits[0];
    if (!button) {
      await send("step", { msg: "Filled, but no submit button found." });
      return;
    }

    await send("step", { msg: `Clicking "${button.text || "submit"}"` });
    await frames[button.frame].click(button.selector);
    await sleep(3000);
    await send("done", { url: page.url() });
  } finally {
    // disconnect, don't close — closing kills the session and the live view goes blank
    await browser.disconnect();
  }
}

/** Cookie banners cover the form and swallow clicks. Best-effort dismissal. */
async function dismissConsentBanner(page: any) {
  try {
    await page.evaluate(() => {
      const wanted = /^(accept|accept all|allow all|i agree|agree|got it|ok)$/i;
      const els = Array.from(document.querySelectorAll("button, a[role=button], [role=button]"));
      for (const el of els as any[]) {
        const t = (el.innerText || "").trim();
        if (wanted.test(t)) {
          el.click();
          return;
        }
      }
    });
    await sleep(600);
  } catch {
    /* nothing to dismiss */
  }
}

// ---------------------------------------------------------------------------
// Functions below run inside the page. They are stringified and shipped over
// CDP, so they cannot reference anything from module scope.
// ---------------------------------------------------------------------------

const FIND_CONTACT_LINK = () => {
  const score = (href: string, text: string) => {
    const h = (href || "").toLowerCase();
    const t = (text || "").toLowerCase().trim();
    let s = 0;
    if (/\/contact\/?$/.test(h)) s += 12;
    if (/contact/.test(h)) s += 8;
    if (/^contact/.test(t)) s += 8;
    if (/contact/.test(t)) s += 5;
    if (/get.?in.?touch|reach.?us|talk.?to.?us|write.?to.?us/.test(h + " " + t)) s += 7;
    if (/support|help.?center/.test(h)) s += 2;
    if (/blog|careers|jobs|login|signup|pricing/.test(h)) s -= 6;
    return s;
  };

  let best: string | null = null;
  let bestScore = 0;
  document.querySelectorAll("a[href]").forEach((a: any) => {
    const s = score(a.href, a.innerText);
    if (s > bestScore) {
      bestScore = s;
      best = a.href;
    }
  });
  return bestScore >= 6 ? best : null;
};

const COLLECT_FIELDS = () => {
  const esc = (s: string) =>
    (window as any).CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");

  // A field you cannot see is a honeypot. Filling it marks you as a bot.
  const visible = (el: any) => {
    if (el.type === "hidden") return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    if (r.left + r.width < -500 || r.top + r.height < -500) return false; // shoved off-canvas
    return true;
  };

  const selectorFor = (el: any) => {
    if (el.id && document.querySelectorAll("#" + esc(el.id)).length === 1) return "#" + esc(el.id);
    const tag = el.tagName.toLowerCase();
    if (el.name) {
      const s = tag + '[name="' + el.name.replace(/"/g, '\\"') + '"]';
      if (document.querySelectorAll(s).length === 1) return s;
    }
    const parts: string[] = [];
    let node: any = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c: any) => c.tagName === node.tagName);
        if (sibs.length > 1) part += ":nth-of-type(" + (sibs.indexOf(node) + 1) + ")";
      }
      parts.unshift(part);
      if (node.id) {
        parts[0] = "#" + esc(node.id);
        break;
      }
      node = node.parentElement;
    }
    return parts.join(" > ");
  };

  const labelFor = (el: any) => {
    if (el.labels && el.labels.length) return (el.labels[0].innerText || "").trim();
    const wrap = el.closest("label");
    if (wrap) return (wrap.innerText || "").trim();
    if (el.id) {
      const l: any = document.querySelector('label[for="' + esc(el.id) + '"]');
      if (l) return (l.innerText || "").trim();
    }
    return "";
  };

  const skip = ["hidden", "submit", "button", "reset", "image", "file"];
  const fields: any[] = [];

  document.querySelectorAll("input, textarea, select").forEach((el: any) => {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || (tag === "select" ? "select" : "text")).toLowerCase();
    if (tag === "input" && skip.indexOf(type) !== -1) return;
    if (el.disabled || el.readOnly) return;
    if (!visible(el)) return;

    fields.push({
      selector: selectorFor(el),
      tag,
      type,
      name: el.name || "",
      id: el.id || "",
      placeholder: el.getAttribute("placeholder") || "",
      label: labelFor(el).slice(0, 120),
      ariaLabel: el.getAttribute("aria-label") || "",
      required: !!el.required,
      options: tag === "select" ? Array.from(el.options).map((o: any) => o.value) : [],
    });
  });

  const submits: any[] = [];
  document
    .querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]')
    .forEach((el: any) => {
      if (!visible(el)) return;
      const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim();
      const looksRight = el.type === "submit" || /send|submit|contact|get in touch/i.test(text);
      if (!looksRight) return;
      submits.push({ selector: selectorFor(el), text: text.slice(0, 60) });
    });

  return { fields, submits };
};
