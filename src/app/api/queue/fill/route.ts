// src/app/api/queue/fill/route.ts — キュー補充API
//
// 1回の呼び出しで「次の1曲＋そのナレーション」を用意して返す。
// 流れ: 方針（stateVersionごとにキャッシュ）→ 候補生成 → Spotify解決（不一致棄却）
//       → ナレーション生成 → ログ下書き追記 → QueueItemを返却
import { getAccessToken } from "@/server/spotifyAuth";
import {
  buildPolicy,
  generateCandidates,
  resolveTrack,
  buildNarration,
  type Policy,
  type StationState,
  type Candidate,
} from "@/pipeline/core";
import { appendSegment } from "@/logs/store";
import { eraYearRange, yearInRange } from "@/pipeline/definitions";
import type { QueueItem, SegmentLog } from "@/logs/schema";

// 方針キャッシュ（devサーバのプロセス内。キー: sessionId:version）
const policyCache = new Map<string, Policy>();

const CODE_VERSION = process.env.TRIW_CODE_VERSION ?? "mvp-dev";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const state: StationState = body?.state;
    const sessionId: string = body?.sessionId;
    const seq: number = Number(body?.seq);
    const lastTrack: { title: string; artist: string } | null = body?.lastTrack ?? null;
    const history: { title: string; artist: string }[] = Array.isArray(body?.history)
      ? body.history.slice(-20)
      : [];

    if (!sessionId || !state || !Number.isFinite(seq)) {
      return Response.json({ ok: false, error: "bad request" }, { status: 400 });
    }

    const token = await getAccessToken();
    if (!token) {
      return Response.json({ ok: false, error: "not authed" }, { status: 401 });
    }

    // 1) 方針（versionごとに1回だけLLM）
    const cacheKey = `${sessionId}:${state.version}`;
    let policy = policyCache.get(cacheKey);
    if (!policy) {
      policy = await buildPolicy(state);
      policyCache.set(cacheKey, policy);
    }

    // 2) 候補生成 → 3) 解決（最大2バッチ試行）
    let resolved = null as Awaited<ReturnType<typeof resolveTrack>>;
    let picked: Candidate | null = null;

    for (let attempt = 0; attempt < 2 && !resolved; attempt++) {
      const candidates = await generateCandidates({
        policy,
        lastTrack,
        exclude: history,
        count: 4,
      });

      // 年代スライダーのハード制約（definitions.tsの単一定義から）
      const eraRange = eraYearRange(state.sliders?.era ?? 50);

      for (const c of candidates) {
        // 直近履歴と同一アーティストの連発を避ける（直前2曲）
        const recentArtists = history.slice(-2).map((h) => h.artist.toLowerCase());
        if (recentArtists.includes(c.artist.toLowerCase())) continue;

        const r = await resolveTrack(c, token);
        if (!r) continue;

        // 年代検証: レンジ指定があるのに範囲外（または年不明）の曲は棄却
        if (eraRange && !yearInRange(r.year, eraRange)) continue;

        resolved = r;
        picked = c;
        break;
      }
    }

    if (!resolved || !picked) {
      return Response.json(
        { ok: false, error: "no track resolved" },
        { status: 503 },
      );
    }

    // 4) ナレーション
    const narration = await buildNarration({
      next: { title: resolved.title, artist: resolved.artist, year: resolved.year, album: resolved.album },
    });

    // 5) QueueItem + ログ下書き
    const item: QueueItem = {
      id: `seg_${String(sessionId).slice(0, 8)}_${seq}`,
      seq,
      stateVersion: state.version,
      track: {
        title: resolved.title,
        artist: resolved.artist,
        uri: resolved.uri,
        durationMs: resolved.durationMs,
        year: resolved.year,
        album: resolved.album,
      },
      narration,
      candidateWhy: picked.why ?? "",
      resolveMeta: {
        artistExact: resolved.artistExact,
        titleExact: resolved.titleExact,
      },
      status: "queued",
    };

    const log: SegmentLog = {
      ...item,
      sessionId,
      createdAt: new Date().toISOString(),
      playedAt: null,
      feedback: { rating: null, memo: "" },
      conditionSnapshot: state,
      policySnapshot: policy.directive,
      codeVersion: CODE_VERSION,
    };

    await appendSegment(sessionId, log);

    return Response.json({ ok: true, item });
  } catch (e) {
    console.error("fill error", e);
    return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
  }
}
