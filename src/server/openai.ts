// src/server/openai.ts — OpenAI呼び出しの薄いラッパ（JSON応答前提）

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// 変更8: ログにモデル名を残す（プロンプト効果とモデル効果の切り分け用）
export function getModelName(): string {
  return OPENAI_MODEL;
}

export async function callJson<T>(params: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<T> {
  // trim: コピペ時の改行・空白混入はHTTPヘッダを壊す(2026-07に本番で実際に発生)
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY が設定されていません（.env.local）");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: params.temperature ?? 0.8,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean) as T;
}
