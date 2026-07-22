import type { Env } from "./types";

const API = "https://api.cloudflare.com/client/v4";

export interface SessionHandle {
  sessionId: string;
  /** Open this in an iframe to watch the browser. Null if no page target came back. */
  liveUrl: string | null;
}

/**
 * Creates a Browser Run session over the CDP REST endpoint.
 *
 * We create it here rather than via puppeteer.launch() because this response
 * hands back devtoolsFrontendUrl directly — which is the whole point. We can
 * show the user the live view before any automation starts.
 *
 * keepAliveMs is the *inactivity* timeout. Max is 10 minutes.
 */
export async function createSession(env: Env, keepAliveMs = 600_000): Promise<SessionHandle> {
  const url =
    `${API}/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/devtools/browser` +
    `?keep_alive=${keepAliveMs}&targets=true`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
  });

  if (!res.ok) {
    throw new Error(`Could not create a browser session (${res.status}). ${await res.text()}`);
  }

  // The docs show a bare object; the v4 API usually wraps in { result }. Accept both.
  const raw = (await res.json()) as any;
  const data = raw?.result ?? raw;

  if (!data?.sessionId) {
    throw new Error(`Session response had no sessionId: ${JSON.stringify(raw).slice(0, 400)}`);
  }

  const targets: any[] = data.targets ?? [];
  const pageTarget = targets.find((t) => t.type === "page") ?? targets[0];

  return {
    sessionId: data.sessionId,
    liveUrl: pageTarget?.devtoolsFrontendUrl ? toTabView(pageTarget.devtoolsFrontendUrl) : null,
  };
}

/**
 * The URL comes back pointed at the DevTools inspector. `mode=tab` is the clean
 * page-only view, which is what you want in an iframe.
 */
function toTabView(devtoolsFrontendUrl: string): string {
  return devtoolsFrontendUrl
    .replace("/ui/inspector?", "/ui/view?mode=tab&")
    .replace("mode=devtools", "mode=tab");
}
