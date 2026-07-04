// src/app/api/log/route.ts — セグメントログの追記・パッチ・取得
import { appendSegment, patchSegment } from "@/logs/store";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, segment } = body ?? {};
    if (!sessionId || !segment?.id) {
      return Response.json({ ok: false, error: "sessionId / segment.id required" }, { status: 400 });
    }
    const { duplicated } = await appendSegment(sessionId, segment);
    return Response.json({ ok: true, duplicated });
  } catch (e) {
    console.error("log POST error", e);
    return Response.json({ ok: false, error: "log append failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, id, patch } = body ?? {};
    if (!sessionId || !id || !patch) {
      return Response.json({ ok: false, error: "sessionId / id / patch required" }, { status: 400 });
    }
    const { found } = await patchSegment(sessionId, id, patch);
    return Response.json({ ok: found }, { status: found ? 200 : 404 });
  } catch (e) {
    console.error("log PATCH error", e);
    return Response.json({ ok: false, error: "log patch failed" }, { status: 500 });
  }
}
