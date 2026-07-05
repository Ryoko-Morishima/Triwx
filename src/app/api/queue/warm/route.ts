// src/app/api/queue/warm/route.ts — 方針の事前ウォームアップ
// カード・スライダー変更の確定時にクライアントが叩く。失敗しても実害なし（fillが作る）。
import { getAccessToken } from "@/server/spotifyAuth";
import { getOrBuildPolicy } from "@/server/policyCache";

export async function POST(req: Request) {
  try {
    if (!(await getAccessToken())) {
      return Response.json({ ok: false }, { status: 401 });
    }
    const { sessionId, state } = await req.json();
    if (!sessionId || !state) {
      return Response.json({ ok: false }, { status: 400 });
    }
    await getOrBuildPolicy(sessionId, state);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("warm error", e);
    return Response.json({ ok: false }, { status: 500 });
  }
}
