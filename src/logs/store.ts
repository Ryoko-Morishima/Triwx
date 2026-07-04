// src/logs/store.ts — セッション別NDJSONストア
// - append: 同一idは二重追記しない（冪等）
// - patch: idの行を読み・更新・全体書き戻し（ローカル単一ユーザー前提）
import { mkdir, readFile, writeFile, appendFile } from "fs/promises";
import { join } from "path";
import type { SegmentLog } from "@/logs/schema";

function dirPath() {
  return join(process.cwd(), "data", "sessions");
}

function filePath(sessionId: string) {
  const safe = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "");
  return join(dirPath(), `${safe}.ndjson`);
}

async function readAll(sessionId: string): Promise<SegmentLog[]> {
  let text = "";
  try {
    text = await readFile(filePath(sessionId), "utf8");
  } catch {
    return [];
  }

  const out: SegmentLog[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // 壊れた行は読み飛ばす
    }
  }
  return out;
}

export async function appendSegment(
  sessionId: string,
  segment: SegmentLog,
): Promise<{ duplicated: boolean }> {
  await mkdir(dirPath(), { recursive: true });

  const existing = await readAll(sessionId);
  if (existing.some((s) => s.id === segment.id)) {
    return { duplicated: true };
  }

  await appendFile(filePath(sessionId), JSON.stringify(segment) + "\n", "utf8");
  return { duplicated: false };
}

export async function patchSegment(
  sessionId: string,
  id: string,
  patch: Partial<SegmentLog> & { feedback?: Partial<SegmentLog["feedback"]> },
): Promise<{ found: boolean }> {
  const all = await readAll(sessionId);
  const idx = all.findIndex((s) => s.id === id);
  if (idx < 0) return { found: false };

  const current = all[idx];
  const next: SegmentLog = {
    ...current,
    ...patch,
    feedback: { ...current.feedback, ...(patch.feedback ?? {}) },
    track: current.track, // trackとidは後から変更させない
    id: current.id,
  };
  all[idx] = next;

  const body = all.map((s) => JSON.stringify(s)).join("\n") + "\n";
  await writeFile(filePath(sessionId), body, "utf8");
  return { found: true };
}
