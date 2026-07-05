// src/pipeline/fallback.ts — 「放送を止めない」ための緊急フォールバック
//
// 層構造（fill route から利用）:
//   通常生成(2バッチ) → 拡大バッチ → 年代ゲート緊急緩和 → リプレイ → 種曲
// リプレイ: 過去ログの好評価曲を再放送。URI保存済みなのでLLM/Spotify検索なしで即使える。
// 種曲: ログが空の初回セッション用の最終安全網。実在が確実な有名曲。

import type { SegmentLog } from "@/logs/schema";

export type ReplayPick = {
  title: string;
  artist: string;
  uri: string;
  durationMs: number;
  year: number | null;
  album: string | null;
};

/** 過去ログから再放送候補を選ぶ（純関数・テスト可能） */
export function pickReplay(
  logs: SegmentLog[],
  exclude: { title: string; artist: string }[],
  opts: { rand?: () => number; avoidJapanese?: boolean } = {},
): ReplayPick | null {
  const rand = opts.rand ?? Math.random;
  const excludeKey = new Set(
    exclude.map((t) => `${t.title}`.toLowerCase() + "/" + `${t.artist}`.toLowerCase()),
  );

  const usable = logs.filter((s) => {
    const uri = s?.track?.uri;
    if (typeof uri !== "string" || !uri) return false;
    if (s.feedback?.rating === "bad") return false;
    if (s.status === "skipped") return false;
    const key = `${s.track.title}`.toLowerCase() + "/" + `${s.track.artist}`.toLowerCase();
    if (excludeKey.has(key)) return false;
    if (opts.avoidJapanese && (JP_SCRIPT.test(s.track.title) || JP_SCRIPT.test(s.track.artist))) return false;
    return true;
  });

  if (usable.length === 0) return null;

  // 好評価を優先、なければ再生済み、なければ何でも
  const good = usable.filter((s) => s.feedback?.rating === "good");
  const played = usable.filter((s) => s.status === "played");
  const pool = good.length ? good : played.length ? played : usable;

  const s = pool[Math.floor(rand() * pool.length)];
  return {
    title: s.track.title,
    artist: s.track.artist,
    uri: s.track.uri,
    durationMs: s.track.durationMs ?? 0,
    year: s.track.year ?? null,
    album: s.track.album ?? null,
  };
}

/** 初回セッション用の種曲（実在が確実で、Spotifyで解決しやすい有名曲） */
export const seedTracks: { title: string; artist: string }[] = [
  { title: "September", artist: "Earth, Wind & Fire" },
  { title: "Dreams", artist: "Fleetwood Mac" },
  { title: "プラスティック・ラブ", artist: "竹内まりや" },
  { title: "真夜中のドア / Stay With Me", artist: "松原みき" },
  { title: "Sunday Morning", artist: "Maroon 5" },
  { title: "Feels Like We Only Go Backwards", artist: "Tame Impala" },
  { title: "Golden Hour", artist: "JVKE" },
  { title: "Kiss of Life", artist: "Sade" },
  { title: "Just the Two of Us", artist: "Grover Washington, Jr." },
  { title: "波乗りジョニー", artist: "桑田佳祐" },
  { title: "Redbone", artist: "Childish Gambino" },
  { title: "La Vie en rose", artist: "Édith Piaf" },
  { title: "Isn't She Lovely", artist: "Stevie Wonder" },
  { title: "First Love", artist: "宇多田ヒカル" },
  { title: "Africa", artist: "TOTO" },
  { title: "Fly Me to the Moon", artist: "Frank Sinatra" },
];

// ---- 言語ドリフト検知 ----
// 直近の履歴が特定言語圏（現状は日本語スクリプトのみ検知可能）に吸着しているとき、
// それを崩すプロンプト注入文を返す。地域カード指定時はドリフトではなく意図なので呼ばない。

const JP_SCRIPT = /[\u3040-\u30ff\u4e00-\u9fff]/;

export function hasJapaneseScript(s: string): boolean {
  return JP_SCRIPT.test(String(s ?? ""));
}

export function detectLanguageDrift(
  history: { title: string; artist: string }[],
): string | null {
  const recent = history.slice(-3);
  if (recent.length < 2) return null;

  const jpCount = recent.filter(
    (t) => JP_SCRIPT.test(t.title) || JP_SCRIPT.test(t.artist),
  ).length;

  if (jpCount >= 2) {
    return "直近の選曲が日本語圏に偏っています。地域の指定はないので、次の候補には他の言語圏（英語圏に限らない）の曲を必ず複数含め、流れは質感やテンポでつないでください。";
  }
  return null;
}
