# agent-browseruse

Type a URL, watch a real browser open it, find the contact page, and fill the form in front of you.

Cloudflare Worker + Browser Run. Live View streams the session into an iframe, so you see every keystroke as it happens.

This is steps 1–3 of the plan: session, live view, deterministic fill. No LLM yet — the hook for it is marked in `src/automate.ts`.

## Setup

```bash
npm install
```

**1. Account ID** — from the Cloudflare dashboard sidebar. Put it in `wrangler.jsonc` under `vars.CF_ACCOUNT_ID`.

**2. API token** — dashboard → My Profile → API Tokens → Create Token → Custom. Give it:

- `Account · Browser Rendering · Edit`

**3. Local secrets** — create `.dev.vars`:

```
CF_ACCOUNT_ID=your_account_id
CF_API_TOKEN=your_token
```

**4. Run it**

```bash
npm run dev
```

`--remote` is not optional. Browser Run has no local emulation, so `wrangler dev` without it will fail on the binding.

## Deploy

```bash
wrangler secret put CF_API_TOKEN
npm run deploy
```

## Budget

Workers Free gives you 10 minutes of browser time per day and 3 concurrent browsers. A run takes roughly 20–40 seconds, so you get 15–25 runs a day. Sessions idle-close after the `keep_alive` you pass in (10 minutes max), and every idle second counts, so don't leave tabs open.

## Layout

```
src/index.ts     routes, SSE stream
src/session.ts   creates the CDP session, returns the Live View URL
src/automate.ts  the browser work + the in-page extraction functions
src/dummy.ts     heuristic field -> value mapping   <- swap for Gemini
src/ui.ts        the single page
```

## Verify it in order

1. `npm run dev`, open the page, press Run against `https://example.com`. You should see the page appear in the iframe within a few seconds. That proves session + Live View.
2. Try a site with a real contact form. Watch the log — it prints every field it found with the selector it generated. Wrong selectors show up here, not later.
3. Only then tick **Click submit**.

If the iframe stays blank but the log advances, `live.browser.run` is refusing to be framed. Open the URL from the log in a new tab instead — the automation is unaffected.

## Adding Gemini (step 4)

In `src/automate.ts`:

```ts
const actions: FillAction[] = planFills(fields);
```

Replace with a call that sends `fields` to Gemini and gets back the same array shape. Ask for `responseMimeType: "application/json"` and a `responseSchema` of `{frame, selector, action, value}[]`, and tell it to only use selectors from the input. Keep `planFills` as the fallback when the request 429s — free tier RPM is low enough that you will hit it.

Step 5 is the contact-page pick: replace `FIND_CONTACT_LINK` with a call that sends `[{href, text}]` to Gemini. Keep the regex as the fast path so most sites never spend a request.

## Notes

- `browser.disconnect()`, never `browser.close()` — closing ends the session and the live view goes black.
- Hidden and off-canvas inputs are filtered out during extraction. Those are honeypots; filling them flags you as a bot.
- Fields are collected across all frames, since HubSpot and Typeform embeds live in iframes.
- Submit is off by default. Point this at sites you own or a test form.
