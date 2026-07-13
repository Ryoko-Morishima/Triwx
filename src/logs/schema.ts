// src/logs/schema.ts — ログとキュー項目の型定義（クライアント・サーバ共用）
import type { StationState } from "@/pipeline/core";

export type QueueItem = {
  id: string; // seg_<sessionId先頭8>_<seq>
  seq: number;
  stateVersion: number;
  track: {
    title: string;
    artist: string;
    uri: string;
    durationMs: number;
    year: number | null;
    album: string | null;
  };
  narration: string;
  candidateWhy: string;
  resolveMeta: { artistExact: boolean; titleExact: boolean };
  status: "queued" | "playing" | "played" | "skipped";
  source?: "ai" | "replay" | "seed"; // どの層で選ばれたか
};

export type SegmentLog = QueueItem & {
  sessionId: string;
  userId?: string | null;
  createdAt: string;
  playedAt: string | null;
  feedback: { rating: "good" | "ok" | "bad" | null; memo: string };
  conditionSnapshot: StationState;
  policySnapshot: string;
  codeVersion: string;
  fallbackReason?: string | null; // era_relaxed / replay / seed 等
  driftBreak?: boolean; // 言語ドリフト是正が発動した補充か
  judgeRejected?: number; // 自己判定で落ちた候補数（変更8。旧: 別役審査パスの却下数）
  judgeRejections?: { title: string; artist: string; reason: string }[]; // 変更8: 却下理由つき詳細
  model?: string; // 変更8: 選曲に使ったモデル名
  promptVersion?: string; // 変更8: 生成プロンプトのバージョンタグ
};
