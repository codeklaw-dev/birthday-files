import Anthropic from "@anthropic-ai/sdk";
import { casperChatConfigured, casperReply, type ChatTurn } from "@/lib/server/casper-chat";
import { roomStore } from "@/lib/server/room-store";

/** Casper's live voice mode: the TV sends what it heard, Casper answers. Throttled to protect API credits. */
const recent: number[] = [];
const PER_MINUTE = 12;

export async function POST(req: Request) {
  if (!casperChatConfigured()) return Response.json({ error: "Voice mode needs ANTHROPIC_API_KEY on the server." }, { status: 503 });
  let body: { text?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 400) : "";
  if (!text) return Response.json({ error: "Say something first." }, { status: 400 });
  const history: ChatTurn[] = Array.isArray(body.history)
    ? body.history
        .filter((t): t is ChatTurn => !!t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string")
        .slice(-8)
        .map((t) => ({ role: t.role, text: t.text.slice(0, 600) }))
    : [];

  const now = Date.now();
  while (recent.length && now - recent[0] > 60_000) recent.shift();
  if (recent.length >= PER_MINUTE) return Response.json({ error: "Casper needs a breather." }, { status: 429 });
  recent.push(now);

  try {
    const reply = await casperReply(roomStore.getState(), history, text);
    return Response.json({ reply });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) console.error("casper chat: bad ANTHROPIC_API_KEY");
    else if (err instanceof Anthropic.RateLimitError) console.error("casper chat: rate limited");
    else if (err instanceof Anthropic.APIError) console.error(`casper chat: API error ${err.status}`, err.message);
    else console.error("casper chat:", err);
    return Response.json({ error: "Casper's brain is offline." }, { status: 502 });
  }
}

/** Lets the TV know whether to offer voice mode. */
export function GET() {
  return Response.json({ enabled: casperChatConfigured() });
}
