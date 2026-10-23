import { getAccessToken } from "@/server/spotifyAuth";
import { NextResponse } from "next/server";

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export async function POST(request: Request) {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ error: "Spotify login required" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const title = String(body?.title ?? "").slice(0, 150);
  const artist = String(body?.artist ?? "").slice(0, 150);
  if (!title || !artist) return NextResponse.json({ error: "title and artist required" }, { status: 400 });

  const query = new URLSearchParams({ q: `track:"${title}" artist:"${artist}"`, type: "track", limit: "15" });
  const res = await fetch(`https://api.spotify.com/v1/search?${query}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store"
  });
  if (!res.ok) return NextResponse.json({ error: "Spotify search failed", status: res.status }, { status: 502 });
  const json = await res.json();
  const candidates = (json.tracks?.items ?? []) as Array<{name:string;uri:string;duration_ms:number;is_playable?:boolean;artists:Array<{name:string}>}>;
  const match = candidates.find(item =>
    normalize(item.name) === normalize(title) &&
    item.artists.some(a => normalize(a.name) === normalize(artist)) &&
    item.is_playable !== false &&
    !/karaoke|instrumental|tribute|cover|remix|live|sped up/i.test(item.name.replace(title, ""))
  );
  if (!match) return NextResponse.json({ error: "Exact track not found", candidates: candidates.slice(0, 5).map(x => ({title:x.name,artists:x.artists.map(a=>a.name)})) }, { status: 404 });
  return NextResponse.json({ uri: match.uri, durationMs: match.duration_ms, title: match.name, artist: match.artists.map(a=>a.name).join(", ") });
}
