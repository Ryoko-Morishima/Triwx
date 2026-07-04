// src/app/api/token/route.ts — SDK/クライアント用のアクセストークン払い出し
import { getAccessToken } from "@/server/spotifyAuth";

export async function GET() {
  const token = await getAccessToken();
  if (!token) {
    return Response.json({ authed: false }, { status: 401 });
  }
  return Response.json({ authed: true, accessToken: token });
}
