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

## Layout

```
src/index.ts     routes, SSE stream
src/session.ts   creates the CDP session, returns the Live View URL
src/automate.ts  the browser work + the in-page extraction functions
src/dummy.ts     heuristic field -> value mapping   <- swap for Gemini
src/ui.ts        the single page
```
