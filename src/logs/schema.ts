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
};

export type SegmentLog = QueueItem & {
  sessionId: string;
  createdAt: string;
  playedAt: string | null;
  feedback: { rating: "good" | "ok" | "bad" | null; memo: string };
  conditionSnapshot: StationState;
  policySnapshot: string;
  codeVersion: string;
};
