import { runTask } from "./automate";
import { UI } from "./ui";
import type { Env, Send } from "./types";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return new Response(UI, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (url.pathname === "/run") {
      return handleRun(url, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};

function handleRun(url: URL, env: Env, ctx: ExecutionContext): Response {
  const target = url.searchParams.get("url");
  if (!target) return new Response("Add a ?url= parameter.", { status: 400 });

  let normalized: string;
  try {
    normalized = new URL(target.startsWith("http") ? target : `https://${target}`).toString();
  } catch {
    return new Response("That URL isn't valid.", { status: 400 });
  }

  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    return new Response("Set CF_ACCOUNT_ID and CF_API_TOKEN first — see the README.", {
      status: 500,
    });
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send: Send = (event, data) =>
    writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

  ctx.waitUntil(
    (async () => {
      try {
        await runTask({
          env,
          target: normalized,
          submit: url.searchParams.get("submit") === "1",
          send,
        });
      } catch (err: any) {
        await send("error", { message: err?.message ?? String(err) });
      } finally {
        await send("end", {});
        await writer.close().catch(() => {});
      }
    })(),
  );

  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
