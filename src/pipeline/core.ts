// src/pipeline/core.ts — 選曲パイプライン
// buildPolicy: 卓の状態 → 選曲方針（stateVersionごとに1回だけ呼ぶ想定）
// generateCandidates: 方針＋直前曲＋除外リスト → 候補曲（少量）
// resolveTrack: Spotify検索で実在解決。アーティスト不一致は棄却
// buildNarration: 前曲→次曲のつなぎコメント（1〜2文）

import { callJson } from "@/server/openai";
import { describeState, type SliderId } from "@/pipeline/definitions";

export type StationState = {
  version: number;
  cards: string[];
  sliders: Record<SliderId, number>;
};

export type Policy = {
  stateVersion: number;
  directive: string; // 選曲方針（自然文）
};

export type Candidate = { title: string; artist: string; why: string };

export type ResolvedTrack = {
  uri: string;
  title: string; // Spotify上の正式名
  artist: string; // 主アーティスト
  artists: string[];
  durationMs: number;
  year: number | null;
  album: string | null;
  reissue: boolean; // リマスター等の再発盤マーカーあり（年が原盤年でない可能性）
  artistExact: boolean;
  titleExact: boolean;
};

// ---- 方針生成 ----

export async function buildPolicy(state: StationState): Promise<Policy> {
  const stateText = describeState(state);

  const out = await callJson<{ directive: string }>({
    system:
      "あなたは連続ラジオの選曲家です。リスナーの卓の状態（雰囲気カードとスライダー）を読み、" +
      "これからの選曲方針を日本語で簡潔にまとめます。出力はJSONのみ: " +
      '{"directive": "選曲方針を3〜5文で。音楽的な質感・年代・人気度・冒険度の扱いを具体的に。ことば・地域の指定があれば、それを最優先の条件として方針の冒頭に明記する"}',
    user: stateText,
    temperature: 0.6,
  });

  return { stateVersion: state.version, directive: out.directive };
}

// ---- 候補生成 ----

export async function generateCandidates(params: {
  policy: Policy;
  stateText: string; // describeState()の生テキスト（カード・スライダー条件の厳守用）
  lastTrack: { title: string; artist: string } | null;
  count: number;
  driftNote?: string | null; // 言語・地域の吸着を崩すための追加指示
}): Promise<Candidate[]> {
  const { policy, stateText, lastTrack, count, driftNote } = params;

  // 設計メモ: かつては「最近流れた曲」20件をプロンプトに入れていたが、
  // 長いセッションでこのリストが強力な実例集として働き、方針・カードより
  // 直近の傾向（言語圏など）を模倣させてしまうことが判明した。
  // 重複排除はサーバ側（fill route）でコード的に行い、プロンプトには入れない。

  const lastText = lastTrack
    ? `${lastTrack.title} / ${lastTrack.artist}`
    : "（アンカーなし。選曲条件の中心から自由に選ぶ）";

  const out = await callJson<{ candidates: Candidate[] }>({
    system:
      "あなたは連続ラジオの選曲家です。実在する楽曲のみを挙げてください。曲名とアーティスト名の組み合わせが正確であることが最重要です。" +
      "自信のない組み合わせを出すくらいなら、確実に実在する別の曲を選んでください。" +
      "選曲条件（カード・スライダー）は毎回の候補すべてに適用される現在の条件であり、直前までに流れた曲の傾向より常に優先される。" +
      "「ことば・地域」の指定がある場合、全候補でそれを厳守する。指定がない場合は英語圏だけにも特定の言語圏だけにも偏らず、世界の音楽を視野に入れる。" +
      "重要: 「前の曲からの接続」とは質感・温度・リズム・時代の空気のつながりのことであり、言語や国籍を引き継ぐことではない。" +
      "禁止: 曲名や歌詞にカードの単語が入っているという理由で選ばないこと（例:「ドライブ」でタイトルにdrive/road/rideを含む曲を集める、「雨」でrainを含む曲を集める等）。カードはあくまで音の質感・気分の指定である。" +
      `出力はJSONのみ: {"candidates": [{"title": "曲名（原語表記）", "artist": "アーティスト名（原語表記）", "why": "選んだ理由を一言"}]} を${count}件。` +
      "候補同士は別のアーティストにすること。",
    user: [
      `【選曲条件（現在の卓の状態・厳守）】\n${stateText}`,
      `【選曲方針】\n${policy.directive}`,
      `【直前に流れた曲】\n${lastText}`,
      ...(driftNote ? [`【注意】${driftNote}`] : []),
      "現在の選曲条件を最優先に、次の曲の候補を挙げてください。",
    ].join("\n\n"),
    temperature: 0.9,
  });

  return Array.isArray(out.candidates) ? out.candidates.slice(0, count) : [];
}

// ---- 候補の検品（審査パス） ----
// 生成役は流れや多様性を考えて条件判定が甘くなるため、判定専任の審査役を分離する。
// 条件に明確に合わない候補（例:「踊れる」指定でビートの弱いロック）を解決前に落とす。

export type Verdict = { index: number; fits: boolean };

export function applyVerdicts(
  candidates: Candidate[],
  verdicts: Verdict[] | null | undefined,
): Candidate[] {
  if (!Array.isArray(verdicts) || verdicts.length === 0) return candidates;
  const fitSet = new Set(
    verdicts.filter((v) => v && v.fits === true && Number.isInteger(v.index)).map((v) => v.index),
  );
  const passed = candidates.filter((_, i) => fitSet.has(i));
  // 審査が全滅させた場合は空を返す（fill側が次のバッチへ進む）
  return passed;
}

export async function judgeCandidates(params: {
  conditionsText: string; // describeJudgeConditions()の出力（カード+極値温度のみ）
  candidates: Candidate[];
}): Promise<Candidate[]> {
  const { conditionsText, candidates } = params;
  if (candidates.length === 0) return candidates;

  try {
    const list = candidates
      .map((c, i) => `${i}: ${c.title} / ${c.artist}`)
      .join("\n");

    const out = await callJson<{ verdicts: Verdict[] }>({
      system:
        "あなたは音楽番組の選曲審査員です。候補曲が条件に合っているかだけを判定します。" +
        "その曲を知っていて、いずれかの条件に明確に外れる場合のみ fits: false。" +
        "条件に合う場合、および曲をよく知らない・判断がつかない場合は fits: true（実在確認と重複排除は別工程が行うので、ここでは質感の明確な不適合だけを弾く）。" +
        '出力はJSONのみ: {"verdicts": [{"index": 番号, "fits": true/false}]} を候補全件分。',
      user: `【選曲条件】\n${conditionsText}\n\n【候補】\n${list}`,
      temperature: 0.1,
    });

    const passed = applyVerdicts(candidates, out.verdicts);
    return passed;
  } catch (e) {
    // 審査が落ちても放送は止めない: 無審査で通す
    console.error("judgeCandidates failed, passing all", e);
    return candidates;
  }
}

// ---- Spotify解決 ----

export function normalizeName(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/\s*[\(\[\-–—].*$/, "") // 括弧書き・ダッシュ以降（remaster表記等）を落とす
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const VERSION_MARKERS = /remix|live|edit|acoustic|instrumental|karaoke|demo|sped up|slowed|cover|version|take\s*\d+|outtake|alternate|anthology|rehearsal/i;
const REISSUE_MARKERS = /remaster|reissue|anniversary|deluxe|expanded/i;

/** バージョン選択スコア（小さいほど良い）。原曲を優先し、remix/live/cover等を強く避ける */
export function scoreTrackVersion(rawTitle: string, albumName: string, titleExact: boolean): number {
  let score = 0;
  if (VERSION_MARKERS.test(rawTitle)) score += 10;
  if (REISSUE_MARKERS.test(rawTitle) || REISSUE_MARKERS.test(albumName)) score += 1;
  if (!titleExact) score += 0.5;
  return score;
}

export async function resolveTrack(
  candidate: Candidate,
  accessToken: string,
): Promise<ResolvedTrack | null> {
  const queries = [
    `track:"${candidate.title}" artist:"${candidate.artist}"`,
    `${candidate.title} ${candidate.artist}`,
  ];

  type Scored = { track: ResolvedTrack; score: number };
  const matches = new Map<string, Scored>();

  for (const q of queries) {
    const url =
      "https://api.spotify.com/v1/search?type=track&limit=8&q=" +
      encodeURIComponent(q);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 429) return null; // レート制限: このfillは諦める
    if (!res.ok) continue;

    const data = await res.json();
    const items: any[] = data?.tracks?.items ?? [];

    for (const t of items) {
      if (!t?.uri || matches.has(t.uri)) continue;
      const artists: string[] = (t?.artists ?? []).map((a: any) => String(a?.name ?? ""));
      const artistExact = artists.some(
        (a) => normalizeName(a) === normalizeName(candidate.artist),
      );
      // アーティスト不一致は誤解決とみなし棄却（品質の生命線・不変）
      if (!artistExact) continue;

      const rawTitle = String(t?.name ?? "");
      const albumName = String(t?.album?.name ?? "");
      const titleExact = normalizeName(rawTitle) === normalizeName(candidate.title);
      const reissue = REISSUE_MARKERS.test(rawTitle) || REISSUE_MARKERS.test(albumName);
      const year = t?.album?.release_date
        ? Number(String(t.album.release_date).slice(0, 4)) || null
        : null;

      matches.set(t.uri, {
        score: scoreTrackVersion(rawTitle, albumName, titleExact),
        track: {
          uri: t.uri,
          title: rawTitle,
          artist: artists[0] ?? candidate.artist,
          artists,
          durationMs: t.duration_ms ?? 0,
          year,
          album: albumName || null,
          reissue,
          artistExact,
          titleExact,
        },
      });
    }

    // 1本目のクエリで「原曲」と呼べるもの（score<10）が取れていれば2本目は撃たない
    const best = [...matches.values()].sort((a, b) => a.score - b.score)[0];
    if (best && best.score < 10) break;
  }

  if (matches.size === 0) return null;
  return [...matches.values()].sort((a, b) => a.score - b.score)[0].track;
}

// ---- ナレーション生成 ----

export async function buildNarration(params: {
  next: { title: string; artist: string; year: number | null; album: string | null };
}): Promise<string> {
  const { next } = params;

  const out = await callJson<{ narration: string }>({
    system:
      "あなたは音楽番組の進行役です。次にかける曲の、短い紹介コメントを作ります。" +
      "スタイル: 事実に基づいた解説。ライナーノーツの冒頭のような、簡潔で信頼できる語り口。" +
      "ルール:" +
      "・1〜2文、80〜130字。落ち着いた話し言葉。" +
      "・次の曲のアーティスト名と曲名を必ず含める。" +
      "・与えられた年・アルバム名は使ってよい。加えて、あなたが確実に知っている一般的な事実（アーティストの出身国・地域、ジャンル、活動時期、その曲の音楽的特徴）は使ってよい。" +
      "・少しでも不確かな情報（チャート成績、売上、受賞、制作秘話、タイアップ）は一切入れない。確信のあることだけを話す。" +
      "・前にかかった曲への言及は禁止。選曲の流れ・つながり・雰囲気の変化についての説明も禁止。" +
      "・選曲条件（カードやスライダー）にどう合っているかの説明も禁止。" +
      "・リスナーへの呼びかけ（「おたのしみに」「お聴きください」等）や挨拶・番組名は禁止。" +
      "・文型を毎回変える。「〇〇出身のバンド△△による「X」は、〇年にリリースされたアルバム『Y』収録」のような定型の繰り返しは禁止。年やアルバム名から入っても、音の描写から入ってもよい。" +
      '出力はJSONのみ: {"narration": "コメント本文"}',
    user:
      `次の曲: ${next.title} / ${next.artist}` +
      `${next.year ? ` ・ ${next.year}年` : ""}` +
      `${next.album ? ` ・ アルバム「${next.album}」収録` : ""}`,
    temperature: 0.7,
  });

  return (
    String(out.narration ?? "").trim() ||
    `${next.artist}、${next.year ? next.year + "年の" : ""}「${next.title}」。`
  );
}
