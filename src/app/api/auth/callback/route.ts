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

  // ログにユーザーを紐づけるため、SpotifyユーザーIDを取得してCookieに保存
  try {
    const me = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: "Bearer " + tokens.accessToken },
    }).then((r) => (r.ok ? r.json() : null));
    if (me?.id) {
      store.set("sp_uid", String(me.id), { httpOnly: true, sameSite: "lax", path: "/" });
    }
  } catch {}

  redirect("/");
}
