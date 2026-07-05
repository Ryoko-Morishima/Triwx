// src/logs/store.ts — ログストア（二層構造）
// - DATABASE_URL があれば Postgres（Neon serverless）に保存（本番: Vercel + Neon）
// - なければ従来どおり data/sessions/*.ndjson に保存（ローカル開発）
// 公開APIの appendSegment / patchSegment / listSegments は保存先に依らず同一。
import { mkdir, readFile, writeFile, appendFile, readdir } from "fs/promises";
import { join } from "path";
import { neon } from "@neondatabase/serverless";
import type { SegmentLog } from "@/logs/schema";

const usePg = () => {
  if (process.env.DATABASE_URL) return true;
  if (process.env.VERCEL) {
    throw new Error(
      "Vercel上ではDATABASE_URLが必須です。Vercelダッシュボード → Storage → Create Database (Neon/Postgres) で接続してください。",
    );
  }
  return false;
};

// ---------- Postgres 層 ----------

let tableReady: Promise<void> | null = null;

function sql() {
  return neon(process.env.DATABASE_URL!);
}

function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await sql()`
        CREATE TABLE IF NOT EXISTS segments (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          user_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          data JSONB NOT NULL
        )`;
      await sql()`CREATE INDEX IF NOT EXISTS idx_segments_session ON segments (session_id)`;
    })();
  }
  return tableReady;
}

async function pgAppend(sessionId: string, segment: SegmentLog): Promise<{ duplicated: boolean }> {
  await ensureTable();
  const rows = await sql()`
    INSERT INTO segments (id, session_id, user_id, data)
    VALUES (${segment.id}, ${sessionId}, ${segment.userId ?? null}, ${JSON.stringify(segment)}::jsonb)
    ON CONFLICT (id) DO NOTHING
    RETURNING id`;
  return { duplicated: rows.length === 0 };
}

async function pgPatch(
  sessionId: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<{ found: boolean }> {
  await ensureTable();
  // feedbackはネストマージ、その他はトップレベルマージ。id/track/sessionIdは保護
  const safe: Record<string, unknown> = { ...patch };
  delete safe.id;
  delete safe.track;
  delete safe.sessionId;
  const feedback = safe.feedback as Record<string, unknown> | undefined;
  delete safe.feedback;

  const rows = await sql()`
    UPDATE segments
    SET data = data
      || ${JSON.stringify(safe)}::jsonb
      || CASE
           WHEN ${feedback ? JSON.stringify(feedback) : null}::jsonb IS NULL THEN '{}'::jsonb
           ELSE jsonb_build_object('feedback', COALESCE(data->'feedback', '{}'::jsonb) || ${feedback ? JSON.stringify(feedback) : "{}"}::jsonb)
         END
    WHERE id = ${id} AND session_id = ${sessionId}
    RETURNING id`;
  return { found: rows.length > 0 };
}

async function pgList(limit: number, sessionId?: string): Promise<SegmentLog[]> {
  await ensureTable();
  const rows = sessionId
    ? await sql()`SELECT data FROM segments WHERE session_id = ${sessionId} ORDER BY created_at DESC LIMIT ${limit}`
    : await sql()`SELECT data FROM segments ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map((r: any) => r.data as SegmentLog);
}

// ---------- ファイル層（ローカル開発） ----------

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
    } catch {}
  }
  return out;
}

async function fileAppend(sessionId: string, segment: SegmentLog): Promise<{ duplicated: boolean }> {
  await mkdir(dirPath(), { recursive: true });
  const existing = await readAll(sessionId);
  if (existing.some((s) => s.id === segment.id)) return { duplicated: true };
  await appendFile(filePath(sessionId), JSON.stringify(segment) + "\n", "utf8");
  return { duplicated: false };
}

async function filePatch(
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
    track: current.track,
    id: current.id,
  };
  all[idx] = next;
  await writeFile(filePath(sessionId), all.map((s) => JSON.stringify(s)).join("\n") + "\n", "utf8");
  return { found: true };
}

// ---------- 公開API ----------

export async function appendSegment(sessionId: string, segment: SegmentLog) {
  return usePg() ? pgAppend(sessionId, segment) : fileAppend(sessionId, segment);
}

export async function patchSegment(
  sessionId: string,
  id: string,
  patch: Partial<SegmentLog> & { feedback?: Partial<SegmentLog["feedback"]> },
) {
  return usePg() ? pgPatch(sessionId, id, patch as Record<string, unknown>) : filePatch(sessionId, id, patch);
}

/** 直近のログ取得（分析・エクスポート・7日除外用）。sessionId省略時は全セッション横断 */
export async function listSegments(limit = 200, sessionId?: string): Promise<SegmentLog[]> {
  if (usePg()) return pgList(Math.min(limit, 1000), sessionId);
  if (sessionId) return (await readAll(sessionId)).slice(-limit).reverse();

  // ファイル層の全セッション横断: data/sessions/ 内の全ndjsonを読む（ローカル規模なら十分軽い）
  let files: string[] = [];
  try {
    files = (await readdir(dirPath())).filter((f) => f.endsWith(".ndjson"));
  } catch {
    return [];
  }
  const all: SegmentLog[] = [];
  for (const f of files) {
    all.push(...(await readAll(f.replace(/\.ndjson$/, ""))));
  }
  all.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return all.slice(0, limit);
}
