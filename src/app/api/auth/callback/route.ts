// src/app/api/auth/callback/route.ts — PKCEコールバック
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { exchangeCode, saveTokens } from "@/server/spotifyAuth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return Response.json({ error: error ?? "no code" }, { status: 400 });
  }

  const store = await cookies();
  const verifier = store.get("sp_verifier")?.value;
  if (!verifier) {
    return Response.json({ error: "verifier cookie missing" }, { status: 400 });
  }

  const tokens = await exchangeCode(code, verifier);
  await saveTokens(tokens);
  store.delete("sp_verifier");

  redirect("/");
}
