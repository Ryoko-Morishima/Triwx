// src/logs/stats.ts — 散らし具合レポート（設計原則3の測定装置）
// 純関数のみ。副作用なし・DB/HTTPに触れない（tasks/T4-add-diversity-report.md）。
import type { SegmentLog } from "@/logs/schema";
import { normalizeName } from "@/pipeline/core";
import { hasJapaneseScript } from "@/pipeline/fallback";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export type CountMap = Record<string, number>;

export type ArtistStats = {
  uniqueCount: number;
  duplicationRate: number; // 1 - unique/total
  topRepeated: { artist: string; count: number }[];
};

export type DuplicateTrackViolation = {
  key: string;
  title: string;
  artist: string;
  gapHours: number;
  firstCreatedAt: string;
  secondCreatedAt: string;
};

export type YearStats = {
  min: number | null;
  max: number | null;
  median: number | null;
  missingCount: number;
  decadeHistogram: CountMap;
};

export type LanguageStats = {
  jpCount: number;
  otherCount: number;
  jpRatio: number;
};

export type JudgeRejectedStats = {
  average: number | null;
  max: number | null;
  sampleCount: number;
};

export type ResolveMetaStats = {
  titleMismatchCount: number;
  artistMismatchCount: number;
  titleMismatchRate: number;
  artistMismatchRate: number;
  sampleCount: number;
};

export type FeedbackStats = {
  good: number;
  ok: number;
  bad: number;
  none: number;
  goodRate: number;
  okRate: number;
  badRate: number;
};

export type ConditionBreakdown = {
  key: string; // conditionSnapshot.cards をソートして結合したキー
  count: number;
  feedback: FeedbackStats;
};

export type DiversityStats = {
  totalSegments: number;
  artist: ArtistStats;
  duplicateTracks7d: {
    violationCount: number;
    samples: DuplicateTrackViolation[];
  };
  year: YearStats;
  language: LanguageStats;
  source: CountMap;
  fallbackReason: CountMap;
  judgeRejected: JudgeRejectedStats;
  resolveMeta: ResolveMetaStats;
  feedback: FeedbackStats;
  byCondition: ConditionBreakdown[];
};

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function decadeOf(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

function trackKey(s: SegmentLog): string {
  return `${normalizeName(s.track.title)}::${normalizeName(s.track.artist)}`;
}

function emptyFeedback(): FeedbackStats {
  return { good: 0, ok: 0, bad: 0, none: 0, goodRate: 0, okRate: 0, badRate: 0 };
}

function tallyFeedback(segments: SegmentLog[]): FeedbackStats {
  const stats = emptyFeedback();
  for (const s of segments) {
    const rating = s.feedback?.rating ?? null;
    if (rating === "good") stats.good++;
    else if (rating === "ok") stats.ok++;
    else if (rating === "bad") stats.bad++;
    else stats.none++;
  }
  const total = segments.length || 1;
  stats.goodRate = stats.good / total;
  stats.okRate = stats.ok / total;
  stats.badRate = stats.bad / total;
  return stats;
}

function increment(map: CountMap, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

export function computeDiversityStats(segments: SegmentLog[]): DiversityStats {
  const total = segments.length;

  // ---- アーティスト重複率 ----
  const artistCounts: CountMap = {};
  for (const s of segments) increment(artistCounts, normalizeName(s.track.artist));
  const uniqueArtists = Object.keys(artistCounts).length;
  const topRepeated = Object.entries(artistCounts)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([artist, count]) => ({ artist, count }));

  // ---- 同一曲7日内重複 ----
  const byKey = new Map<string, SegmentLog[]>();
  for (const s of segments) {
    const key = trackKey(s);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(s);
  }
  const violations: DuplicateTrackViolation[] = [];
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const gapMs = new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime();
      if (gapMs >= 0 && gapMs < SEVEN_DAYS_MS) {
        violations.push({
          key,
          title: cur.track.title,
          artist: cur.track.artist,
          gapHours: Math.round((gapMs / (60 * 60 * 1000)) * 10) / 10,
          firstCreatedAt: prev.createdAt,
          secondCreatedAt: cur.createdAt,
        });
      }
    }
  }

  // ---- 年代分布 ----
  const years = segments.map((s) => s.track.year).filter((y): y is number => y != null);
  const decadeHistogram: CountMap = {};
  for (const y of years) increment(decadeHistogram, decadeOf(y));

  // ---- 言語分布 ----
  const jpCount = segments.filter(
    (s) => hasJapaneseScript(s.track.title) || hasJapaneseScript(s.track.artist),
  ).length;

  // ---- source / fallbackReason ----
  const source: CountMap = {};
  const fallbackReason: CountMap = {};
  for (const s of segments) {
    increment(source, s.source ?? "unknown");
    increment(fallbackReason, s.fallbackReason ?? "none");
  }

  // ---- judgeRejected ----
  const judgeSamples = segments
    .map((s) => s.judgeRejected)
    .filter((v): v is number => typeof v === "number");

  // ---- resolveMeta 不一致率 ----
  const resolveSamples = segments.filter((s) => s.resolveMeta != null);
  const titleMismatchCount = resolveSamples.filter((s) => !s.resolveMeta!.titleExact).length;
  const artistMismatchCount = resolveSamples.filter((s) => !s.resolveMeta!.artistExact).length;

  // ---- conditionSnapshot単位の内訳 ----
  const byConditionMap = new Map<string, SegmentLog[]>();
  for (const s of segments) {
    const cards = s.conditionSnapshot?.cards ?? [];
    const key = [...cards].sort().join("+") || "(none)";
    if (!byConditionMap.has(key)) byConditionMap.set(key, []);
    byConditionMap.get(key)!.push(s);
  }
  const byCondition: ConditionBreakdown[] = Array.from(byConditionMap.entries())
    .map(([key, group]) => ({ key, count: group.length, feedback: tallyFeedback(group) }))
    .sort((a, b) => b.count - a.count);

  return {
    totalSegments: total,
    artist: {
      uniqueCount: uniqueArtists,
      duplicationRate: total > 0 ? 1 - uniqueArtists / total : 0,
      topRepeated,
    },
    duplicateTracks7d: {
      violationCount: violations.length,
      samples: violations.slice(0, 20),
    },
    year: {
      min: years.length ? Math.min(...years) : null,
      max: years.length ? Math.max(...years) : null,
      median: median(years),
      missingCount: total - years.length,
      decadeHistogram,
    },
    language: {
      jpCount,
      otherCount: total - jpCount,
      jpRatio: total > 0 ? jpCount / total : 0,
    },
    source,
    fallbackReason,
    judgeRejected: {
      average: judgeSamples.length
        ? Math.round((judgeSamples.reduce((a, b) => a + b, 0) / judgeSamples.length) * 100) / 100
        : null,
      max: judgeSamples.length ? Math.max(...judgeSamples) : null,
      sampleCount: judgeSamples.length,
    },
    resolveMeta: {
      titleMismatchCount,
      artistMismatchCount,
      titleMismatchRate: resolveSamples.length ? titleMismatchCount / resolveSamples.length : 0,
      artistMismatchRate: resolveSamples.length ? artistMismatchCount / resolveSamples.length : 0,
      sampleCount: resolveSamples.length,
    },
    feedback: tallyFeedback(segments),
    byCondition,
  };
}
