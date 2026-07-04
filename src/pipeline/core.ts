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
  lastTrack: { title: string; artist: string } | null;
  exclude: { title: string; artist: string }[];
  count: number;
}): Promise<Candidate[]> {
  const { policy, lastTrack, exclude, count } = params;

  const excludeText = exclude.length
    ? exclude.map((t) => `- ${t.title} / ${t.artist}`).join("\n")
    : "（なし）";

  const lastText = lastTrack
    ? `${lastTrack.title} / ${lastTrack.artist}`
    : "（これが最初の曲。方針に合う入り口の曲を選ぶ）";

  const out = await callJson<{ candidates: Candidate[] }>({
    system:
      "あなたは連続ラジオの選曲家です。実在する楽曲のみを挙げてください。曲名とアーティスト名の組み合わせが正確であることが最重要です。" +
      "方針に「ことば・地域」の指定がある場合、全候補でそれを厳守する（英語圏の曲を混ぜない）。指定がない場合も英語圏だけに偏らず、世界の音楽を視野に入れる。" +
      "自信のない組み合わせを出すくらいなら、確実に実在する別の曲を選んでください。" +
      `出力はJSONのみ: {"candidates": [{"title": "曲名（原語表記）", "artist": "アーティスト名（原語表記）", "why": "前の曲からの接続理由を一言"}]} を${count}件。` +
      "同一アーティストの連続は避け、除外リストの曲・アーティストの直近使用も避けてください。",
    user: [
      `【選曲方針】\n${policy.directive}`,
      `【直前に流れた曲】\n${lastText}`,
      `【最近流れた曲（除外）】\n${excludeText}`,
      "前の曲からの流れを意識しつつ、方針に沿った次の曲の候補を挙げてください。",
    ].join("\n\n"),
    temperature: 0.9,
  });

  return Array.isArray(out.candidates) ? out.candidates.slice(0, count) : [];
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

export async function resolveTrack(
  candidate: Candidate,
  accessToken: string,
): Promise<ResolvedTrack | null> {
  const queries = [
    `track:"${candidate.title}" artist:"${candidate.artist}"`,
    `${candidate.title} ${candidate.artist}`,
  ];

  for (const q of queries) {
    const url =
      "https://api.spotify.com/v1/search?type=track&limit=5&q=" +
      encodeURIComponent(q);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 429) {
      // レート制限: このfillは諦める（次のfillで回復）
      return null;
    }
    if (!res.ok) continue;

    const data = await res.json();
    const items: any[] = data?.tracks?.items ?? [];

    for (const t of items) {
      const artists: string[] = (t?.artists ?? []).map((a: any) => String(a?.name ?? ""));
      const artistExact = artists.some(
        (a) => normalizeName(a) === normalizeName(candidate.artist),
      );

      // アーティスト不一致は誤解決とみなし棄却（このアプリの品質の生命線）
      if (!artistExact) continue;

      const titleExact = normalizeName(t?.name ?? "") === normalizeName(candidate.title);
      const year = t?.album?.release_date
        ? Number(String(t.album.release_date).slice(0, 4)) || null
        : null;

      return {
        uri: t.uri,
        title: t.name,
        artist: artists[0] ?? candidate.artist,
        artists,
        durationMs: t.duration_ms ?? 0,
        year,
        album: t?.album?.name ?? null,
        artistExact,
        titleExact,
      };
    }
  }

  return null;
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
