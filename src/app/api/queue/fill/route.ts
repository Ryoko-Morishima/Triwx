// src/app/api/queue/fill/route.ts — キュー補充API（多層フォールバック版）
//
// 「放送を止めない」ための層構造。上から順に試し、最初に成功した層を使う:
//   L1: 通常生成（自己判定つき、頭出し4曲×2バッチ、年代ゲート厳守）
//   L2: 拡大バッチ（頭出し6曲、実在確実な曲を強調）
//   L3: 年代ゲートの緊急緩和（ゲートで棄却済みの解決済み曲から、レンジに最も近い年を救済）
//   L4: リプレイ（過去ログの好評価曲を再放送。LLM/検索不要）
//   L5: 種曲（初回セッション用の安全網）
// アーティスト不一致の棄却（品質の生命線）はどの層でも緩めない。
// どの層で成立したかは source / fallbackReason としてログに残す。
// 候補の自己判定（カード適合の検品）はgenerateCandidates内で完結する（別役の審査パスは廃止。tasks/triwx-revision-spec.md 変更6/9-8）。
import { getAccessToken } from "@/server/spotifyAuth";
import { getModelName } from "@/server/openai";
import { cookies } from "next/headers";
import {
  generateCandidates,
  resolveTrack,
  normalizeName,
  buildNarration,
  verifyRegionDeclaration,
  getArtistNationalityOverride,
  PROMPT_VERSION,
  type Policy,
  type StationState,
  type Candidate,
  type ResolvedTrack,
} from "@/pipeline/core";
import { appendSegment, listSegments } from "@/logs/store";
import { getOrBuildPolicy, defaultPolicy } from "@/server/policyCache";
import { eraYearRange, yearInRange, isRegionCard, describeState } from "@/pipeline/definitions";
import { pickReplay, seedTracks, detectLanguageDrift, hasJapaneseScript } from "@/pipeline/fallback";
import type { QueueItem, SegmentLog } from "@/logs/schema";

const policyCache = new Map<string, Policy>();
const CODE_VERSION = process.env.TRIW_CODE_VERSION ?? "mvp-dev";

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

    // ---- 方針（warmで事前生成済みなら即時。失敗しても既定方針で放送続行） ----
    let policy: Policy;
    try {
      policy = await getOrBuildPolicy(sessionId, state);
    } catch (e) {
      console.error("buildPolicy failed, using default", e);
      policy = defaultPolicy(state);
    }

    const eraRange = eraYearRange(state.sliders?.era ?? 50);

    // 地域カード未指定のときだけ、言語圏への吸着を検知して崩す
    const currentRegionCard = (state.cards ?? []).find((id) => isRegionCard(id)) ?? null;
    const hasRegionCard = !!currentRegionCard;
    const driftNote = hasRegionCard ? null : detectLanguageDrift(history);

    // 選曲条件の生テキスト（プロンプトに毎回注入し、直近の傾向より優先させる）
    const stateText = describeState(state);

    // 重複排除はコードで行う（プロンプトに履歴を入れない）。
    // 表記ゆれ（リミックス接尾辞・feat.・全角等）で破れないよう normalizeName で正規化する
    const normKey = (title: string, artist: string) =>
      normalizeName(title) + "/" + normalizeName(artist);
    const historyKeys = new Set(history.map((h) => normKey(h.title, h.artist)));

    // 直近7日にかかった曲は全セッション横断で除外（それより前はプールに復帰する減衰設計。
    // 「散らすための除外」が「永久に定番がかからない呪い」にならないための歯止め）
    const RECENT_DAYS = 7;
    try {
      const recent = await listSegments(500);
      const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
      for (const seg of recent) {
        const at = seg?.createdAt ? Date.parse(seg.createdAt) : NaN;
        if (Number.isFinite(at) && at >= cutoff && seg?.track?.title) {
          historyKeys.add(normKey(seg.track.title, seg.track.artist));
        }
      }
    } catch {
      // 参照失敗は無視（セッション内除外だけで続行）
    }

    // アーティストのクールダウン: 直近10曲は同一アーティストを出さない
    const cooldownArtists = new Set(
      history.slice(-10).map((h) => normalizeName(h.artist)),
    );

    let resolved: ResolvedTrack | null = null;
    let picked: Candidate | null = null;
    let source: "ai" | "replay" | "seed" = "ai";
    let fallbackReason: string | null = null;
    const driftBreak = !!driftNote;
    let judgeRejectedTotal = 0;
    const judgeRejectionsAll: { title: string; artist: string; reason: string }[] = [];

    // ゲートで棄却した解決済み曲を控えておく（L3で救済に使う）
    const eraGated: { r: ResolvedTrack; c: Candidate }[] = [];

    const tryCandidates = async (count: number, emphasizeReal: boolean) => {
      let candidates: Candidate[] = [];
      try {
        // 変更6/9-8: 審査は別役のLLMパスではなく、生成コール内の自己判定で完結させる
        const result = await generateCandidates({
          policy: emphasizeReal
            ? { ...policy!, directive: policy!.directive + "\n（注意: 確実に実在する、よく知られた曲を優先すること）" }
            : policy!,
          stateText,
          // ドリフト是正中はアンカー（直前曲）を切って方針の中心から選び直させる
          lastTrack: driftNote ? null : lastTrack,
          count,
          driftNote,
        });
        candidates = result.passed;
        judgeRejectedTotal += result.rejected.length;
        judgeRejectionsAll.push(...result.rejected);
      } catch (e) {
        console.error("generateCandidates failed", e);
        return;
      }

      for (const c of candidates) {
        // コード側の重複排除（正規化キー）とアーティスト・クールダウン
        if (historyKeys.has(normKey(c.title, c.artist))) continue;
        if (cooldownArtists.has(normalizeName(c.artist))) continue;
        // 言語ハードゲート: 是正中は日本語スクリプトの候補を通さない（プロンプト任せにしない）
        if (driftNote && (hasJapaneseScript(c.title) || hasJapaneseScript(c.artist))) continue;
        // 変更12改訂: 地域カード指定時は、モデルの自己判定を信用せず、
        // candidateWhyの「国籍/活動拠点: ○○」宣言をコード側で機械的に再検証する
        // （却下段階では機能していても最終選出で一致しないケースが実運用で再発したため）
        // 変更14: ただしThe Killers等、モデルが系統的に虚偽申告する頻出アーティストは
        // 自己申告そのものが信用できないため、既知の補正リストがあればそちらを優先する
        if (currentRegionCard) {
          const override = getArtistNationalityOverride(c.artist);
          const regionOk = override
            ? override === currentRegionCard
            : verifyRegionDeclaration(c.why, currentRegionCard);
          if (!regionOk) {
            judgeRejectionsAll.push({
              title: c.title,
              artist: c.artist,
              reason: override
                ? "コード側検証: 既知の国籍補正リストにより指定地域と不一致(自己申告は無視)"
                : "コード側検証: 国籍/活動拠点の記載なし、または指定地域と不一致",
            });
            judgeRejectedTotal += 1;
            continue;
          }
        }

        const r = await resolveTrack(c, token);
        if (!r) continue;
        // 解決後の正式表記でも再チェック（候補表記と正式表記のズレによるすり抜け防止）
        if (historyKeys.has(normKey(r.title, r.artist))) continue;
        if (cooldownArtists.has(normalizeName(r.artist))) continue;
        if (driftNote && (hasJapaneseScript(r.title) || hasJapaneseScript(r.artist))) continue;

        // 年代ゲート。リイシュー盤（リマスター等）は年が原盤年でない可能性があるため、
        // 「新しめ」指定（minYearあり）のときは通さない。「古め」のみの指定なら通す。
        if (eraRange) {
          const blocked = r.reissue
            ? eraRange.minYear != null
            : !yearInRange(r.year, eraRange);
          if (blocked) {
            eraGated.push({ r, c });
            continue;
          }
        }
        resolved = r;
        picked = c;
        return;
      }
    };

    // L1: 通常生成×2バッチ
    for (let i = 0; i < 2 && !resolved; i++) await tryCandidates(4, false);

    // L2: 拡大バッチ
    if (!resolved) await tryCandidates(6, true);

    // L3: 年代ゲートの緊急緩和（レンジに最も近い年の曲を救済）
    if (!resolved && eraGated.length > 0) {
      const dist = (y: number | null) => {
        if (y == null || !eraRange) return 9999;
        if (eraRange.minYear != null && y < eraRange.minYear) return eraRange.minYear - y;
        if (eraRange.maxYear != null && y > eraRange.maxYear) return y - eraRange.maxYear;
        return 0;
      };
      eraGated.sort((a, b) => dist(a.r.year) - dist(b.r.year));
      resolved = eraGated[0].r;
      picked = eraGated[0].c;
      fallbackReason = "era_relaxed";
    }

    // L4: リプレイ（過去ログから。LLM/検索不要）
    if (!resolved) {
      try {
        const logs = await listSegments(300, undefined).catch(() => listSegments(300, sessionId));
        // 変更7c: 現在の地域カードと元の再生時のconditionSnapshotを照合し、不一致なら注入しない
        const currentPersonalityCards = (state.cards ?? []).filter((id) => !isRegionCard(id));
        const pick = pickReplay(logs, history, {
          avoidJapanese: !!driftNote,
          regionCard: currentRegionCard,
          personalityCards: currentPersonalityCards,
        });
        if (pick) {
          resolved = {
            uri: pick.uri,
            title: pick.title,
            artist: pick.artist,
            artists: [pick.artist],
            durationMs: pick.durationMs,
            year: pick.year,
            album: pick.album,
            reissue: false,
            artistExact: true,
            titleExact: true,
          };
          picked = { title: pick.title, artist: pick.artist, why: "replay" };
          source = "replay";
          fallbackReason = fallbackReason ?? "replay";
        }
      } catch (e) {
        console.error("replay layer failed", e);
      }
    }

    // L5: 種曲（初回セッションの安全網）。1周目は年代ゲートを守り、全滅時のみ2周目で無視
    if (!resolved) {
      for (const respectEra of [true, false]) {
        if (resolved) break;
        for (const seed of shuffled(seedTracks)) {
          if (historyKeys.has(normKey(seed.title, seed.artist))) continue;
          if (cooldownArtists.has(normalizeName(seed.artist))) continue;
          if (driftNote && (hasJapaneseScript(seed.title) || hasJapaneseScript(seed.artist))) continue;
          const r = await resolveTrack({ ...seed, why: "seed" }, token);
          if (!r) continue;
          if (respectEra && eraRange) {
            const blocked = r.reissue ? eraRange.minYear != null : !yearInRange(r.year, eraRange);
            if (blocked) continue;
          }
          resolved = r;
          picked = { ...seed, why: "seed" };
          source = "seed";
          fallbackReason = fallbackReason ?? (respectEra ? "seed" : "seed_unconditional");
          break;
        }
      }
    }

    if (!resolved || !picked) {
      // ここに来るのはSpotify検索自体が落ちている場合のみ（＝再生も不可能な状況）
      return Response.json({ ok: false, error: "no track resolved" }, { status: 503 });
    }
    const final: ResolvedTrack = resolved;
    const finalPick: Candidate = picked;

    // ---- ナレーション（失敗しても止めない: 定型文で続行） ----
    let narration: string;
    try {
      narration = await buildNarration({
        next: { title: final.title, artist: final.artist, year: final.year, album: final.album },
      });
    } catch (e) {
      console.error("buildNarration failed, using template", e);
      narration = `${final.artist}${final.year ? `、${final.year}年` : ""}の「${final.title}」。`;
    }
    if (source === "replay") {
      narration = `もう一度かけます。${final.artist}で「${final.title}」。`;
    }

    const item: QueueItem = {
      id: `seg_${String(sessionId).slice(0, 8)}_${seq}`,
      seq,
      stateVersion: state.version,
      track: {
        title: final.title,
        artist: final.artist,
        uri: final.uri,
        durationMs: final.durationMs,
        year: final.year,
        album: final.album,
      },
      narration,
      candidateWhy: finalPick.why ?? "",
      resolveMeta: { artistExact: final.artistExact, titleExact: final.titleExact },
      status: "queued",
      source,
    };

    const uid = (await cookies()).get("sp_uid")?.value ?? null;

    const log: SegmentLog = {
      ...item,
      sessionId,
      userId: uid,
      createdAt: new Date().toISOString(),
      playedAt: null,
      feedback: { rating: null, memo: "" },
      conditionSnapshot: state,
      policySnapshot: policy.directive,
      codeVersion: CODE_VERSION,
      fallbackReason,
      driftBreak,
      judgeRejected: judgeRejectedTotal,
      judgeRejections: judgeRejectionsAll,
      model: getModelName(),
      promptVersion: PROMPT_VERSION,
    };

    await appendSegment(sessionId, log);

    return Response.json({ ok: true, item });
  } catch (e) {
    console.error("fill error", e);
    return Response.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
  }
}
