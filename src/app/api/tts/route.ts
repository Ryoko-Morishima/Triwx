// src/app/api/tts/route.ts — 高音質ナレーション音声（OpenAI TTS）
// 失敗時はクライアント側がブラウザTTSにフォールバックする
import { getAccessToken } from "@/server/spotifyAuth";

export async function POST(req: Request) {
  try {
    if (!(await getAccessToken())) {
      return new Response("not authed", { status: 401 });
    }
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response("text required", { status: 400 });
    }

    const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey) return new Response("OPENAI_API_KEY missing", { status: 500 });

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice: process.env.OPENAI_TTS_VOICE || "sage",
        input: text.slice(0, 400),
        instructions:
          "深夜の音楽番組のDJとして、落ち着いた低めのトーンで、自然な日本語の話し言葉として読む。急がず、間を大切に。",
        response_format: "mp3",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("tts error", res.status, body.slice(0, 200));
      return new Response("tts failed", { status: 502 });
    }

    return new Response(res.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("tts route error", e);
    return new Response("tts failed", { status: 500 });
  }
}
