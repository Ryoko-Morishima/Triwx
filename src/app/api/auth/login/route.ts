// src/app/api/auth/login/route.ts — PKCE開始
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "crypto";
import { redirectUri, SCOPES } from "@/server/spotifyAuth";

function base64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET() {
  const clientId = (process.env.SPOTIFY_CLIENT_ID ?? "").trim() || undefined;
  if (!clientId) {
    return Response.json(
      { error: "SPOTIFY_CLIENT_ID が未設定です。.env.local を確認してください。" },
      { status: 500 },
    );
  }

  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash("sha256").update(verifier).digest());

  const store = await cookies();
  store.set("sp_verifier", verifier, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  redirect("https://accounts.spotify.com/authorize?" + params.toString());
}
