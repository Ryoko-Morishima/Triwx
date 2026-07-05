// src/server/spotifyAuth.ts — PKCE認証のトークン管理（httpOnly Cookie）
import { cookies } from "next/headers";

const TOKEN_URL = "https://accounts.spotify.com/api/token";

export function baseUrl(): string {
  return (process.env.APP_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
}

export function redirectUri(): string {
  return baseUrl() + "/api/auth/callback";
}

function isHttps(): boolean {
  return baseUrl().startsWith("https://");
}

export const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

type TokenSet = { accessToken: string; refreshToken: string; expiresAt: number };

export async function saveTokens(t: TokenSet) {
  const store = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: isHttps() };
  store.set("sp_access", t.accessToken, opts);
  store.set("sp_refresh", t.refreshToken, opts);
  store.set("sp_expires", String(t.expiresAt), opts);
}

/** 有効なアクセストークンを返す。期限切れ間近ならリフレッシュ。未認証なら null */
export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  const access = store.get("sp_access")?.value;
  const refresh = store.get("sp_refresh")?.value;
  const expiresAt = Number(store.get("sp_expires")?.value ?? 0);

  if (access && Date.now() < expiresAt - 60_000) return access;
  if (!refresh) return null;

  const clientId = (process.env.SPOTIFY_CLIENT_ID ?? "").trim() || undefined;
  if (!clientId) throw new Error("SPOTIFY_CLIENT_ID が設定されていません（.env.local）");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: clientId,
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const next: TokenSet = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refresh,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  await saveTokens(next);
  return next.accessToken;
}

export async function exchangeCode(code: string, verifier: string): Promise<TokenSet> {
  const clientId = (process.env.SPOTIFY_CLIENT_ID ?? "").trim() || undefined;
  if (!clientId) throw new Error("SPOTIFY_CLIENT_ID が設定されていません（.env.local）");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: clientId,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`token exchange failed ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}
