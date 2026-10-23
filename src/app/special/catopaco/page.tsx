"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { program } from "@/programs/catopaco";

type Phase = "idle" | "connecting" | "talking" | "playing" | "ended" | "error";
type Resolved = {uri:string;durationMs:number;title:string;artist:string};

declare global {
  interface Window { Spotify: any; onSpotifyWebPlaybackSDKReady: () => void }
}

const sleep = (ms:number) => new Promise<void>(r=>setTimeout(r,ms));
function chunkSpeech(value:string, max=260):string[] {
  const parts = value.match(/[^。！？]+[。！？]?/g) ?? [value];
  const result:string[]=[]; let current="";
  for(const part of parts) {
    if ((current+part).length>max && current) {result.push(current);current="";}
    if(part.length>max) {for(let i=0;i<part.length;i+=max)result.push(part.slice(i,i+max));}
    else current+=part;
  }
  if(current)result.push(current);
  return result.filter(Boolean);
}
async function getToken():Promise<string> {
  const res=await fetch("/api/token");
  if(!res.ok)throw new Error("Spotifyにログインしてください");
  const data=await res.json();
  if(!data.accessToken)throw new Error("Spotifyトークンを取得できません");
  return data.accessToken;
}
async function loadSdk():Promise<void> {
  if(window.Spotify)return;
  await new Promise<void>((resolve,reject)=>{
    const prev=window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady=()=>{prev?.();resolve()};
    if(!document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]')) {
      const script=document.createElement("script");
      script.src="https://sdk.scdn.co/spotify-player.js";
      script.onerror=()=>reject(new Error("Spotify SDKの読み込みに失敗しました"));
      document.body.appendChild(script);
    }
    setTimeout(()=>reject(new Error("Spotify SDKが応答しません")),15000);
  });
}

export default function SpecialPage() {
  const [phase,setPhase]=useState<Phase>("idle");
  const [index,setIndex]=useState(0);
  const [message,setMessage]=useState("");
  const [spoken,setSpoken]=useState("");
  const [voice,setVoice]=useState<"hq"|"browser"|"off">("hq");
  const [progress,setProgress]=useState({position:0,duration:0});
  const [paused,setPaused]=useState(false);
  const [authed,setAuthed]=useState<boolean|null>(null);
  const player=useRef<any>(null);
  const deviceId=useRef("");
  const alive=useRef(false);
  const busy=useRef(false);
  const positionMax=useRef(0);
  const skipSignal=useRef(0);
  const currentIndex=useRef(0);
  const phaseRef=useRef<Phase>("idle");
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const soundUri=useRef<string|null>(null);
  const utteranceRef=useRef<SpeechSynthesisUtterance|null>(null);
  const voiceRef=useRef(voice);
  voiceRef.current=voice;

  const updatePhase=(p:Phase)=>{phaseRef.current=p;setPhase(p)};
  useEffect(()=>{fetch("/api/token").then(r=>setAuthed(r.ok)).catch(()=>setAuthed(false)); return ()=>{
    alive.current=false;
    skipSignal.current++;
    try{player.current?.disconnect()}catch{}
    try{audioRef.current?.pause()}catch{}
    if(typeof speechSynthesis!=="undefined")speechSynthesis.cancel();
  }},[]);

  const cancelSpeech=useCallback(()=>{
    skipSignal.current++;
    try{audioRef.current?.pause()}catch{}
    audioRef.current=null;
    if(typeof speechSynthesis!=="undefined")speechSynthesis.cancel();
  },[]);

  const speakBrowser=useCallback(async(text:string,ticket:number)=>{
    if(typeof speechSynthesis==="undefined")return;
    await new Promise<void>(resolve=>{
      const u=new SpeechSynthesisUtterance(text);
      u.lang="ja-JP";u.rate=0.96;
      utteranceRef.current=u;
      u.onend=()=>resolve();u.onerror=()=>resolve();
      speechSynthesis.speak(u);
      const check=setInterval(()=>{if(!alive.current||skipSignal.current!==ticket){clearInterval(check);speechSynthesis.cancel();resolve();}},250);
      u.onend=()=>{clearInterval(check);resolve()};u.onerror=()=>{clearInterval(check);resolve()};
    });
  },[]);

  const talk=useCallback(async(text:string)=>{
    if(!text.trim())return;
    setSpoken(text);
    updatePhase("talking");
    const ticket=skipSignal.current;
    if(voiceRef.current==="off")return;
    for(const part of chunkSpeech(text)){
      if(!alive.current||skipSignal.current!==ticket)return;
      if(voiceRef.current==="hq") {
        try{
          const res=await fetch("/api/tts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:part})});
          if(res.ok){
            const blob=await res.blob();
            if(!alive.current||skipSignal.current!==ticket)return;
            const url=URL.createObjectURL(blob);
            await new Promise<void>(resolve=>{
              const a=new Audio(url);audioRef.current=a;
              const done=()=>{URL.revokeObjectURL(url);audioRef.current=null;resolve()};
              a.onended=done;a.onerror=done;a.play().catch(done);
              const tick=setInterval(()=>{
                if(!alive.current||skipSignal.current!==ticket){clearInterval(tick);a.pause();done()}
              },200);
              const prev=done;
              a.onended=()=>{clearInterval(tick);prev()};a.onerror=()=>{clearInterval(tick);prev()};
            });
            continue;
          }
        }catch{}
      }
      await speakBrowser(part,ticket);
    }
  },[speakBrowser]);

  const resolveSong=useCallback(async(i:number):Promise<Resolved>=>{
    const song=program.songs[i];
    const res=await fetch("/api/programs/resolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:song.title,artist:song.artist})});
    const data=await res.json();
    if(!res.ok||!data.uri)throw new Error(`曲 ${i+1}: ${song.artist}「${song.title}」をSpotifyで正確に照合できませんでした。別のバージョンへ自動変更していません。`);
    return data;
  },[]);

  const playSong=useCallback(async(i:number, resolved:Resolved)=>{
    const token=await getToken();
    const res=await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId.current)}`,{
      method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({uris:[resolved.uri]})
    });
    if(!res.ok)throw new Error(`Spotify再生に失敗しました（${res.status}）。Premiumアカウントと再生デバイスを確認してください。`);
    soundUri.current=resolved.uri;
    positionMax.current=0;setProgress({position:0,duration:resolved.durationMs});
    updatePhase("playing");setPaused(false);
  },[]);

  const advance=useCallback(async(i:number)=>{
    if(busy.current||!alive.current)return;
    busy.current=true;
    try{
      if(i>=program.songs.length){updatePhase("ended");setSpoken("番組は終了しました。");return}
      currentIndex.current=i;setIndex(i);
      const song=program.songs[i];
      const ticket=skipSignal.current;
      // Resolve in parallel with narration, while keeping the spoken introduction in order.
      const resolution=resolveSong(i);
      if(song.intro)await talk(song.intro);
      if(!alive.current||skipSignal.current!==ticket)return;
      const resolved=await resolution;
      if(!alive.current||skipSignal.current!==ticket)return;
      await playSong(i,resolved);
    }catch(e){
      updatePhase("error");setMessage(e instanceof Error?e.message:String(e));
    }finally{busy.current=false}
  },[resolveSong,talk,playSong]);

  const afterTrack=useCallback(async()=>{
    if(busy.current||!alive.current)return;
    busy.current=true;
    const ticket=skipSignal.current;
    try{
      await player.current?.pause();
      const i=currentIndex.current;
      await talk(program.songs[i].after);
    }finally{
      busy.current=false;
    }
    if(alive.current&&skipSignal.current===ticket)void advance(currentIndex.current+1);
  },[talk,advance]);

  useEffect(()=>{
    if(phase!=="playing")return;
    const timer=setInterval(async()=>{
      if(busy.current||phaseRef.current!=="playing")return;
      const state=await player.current?.getCurrentState().catch(()=>null);
      if(!state)return;
      const pos=state.position as number, dur=state.duration as number;
      setProgress({position:pos,duration:dur});setPaused(state.paused);
      positionMax.current=Math.max(positionMax.current,pos);
      if(!state.paused&&dur>0&&dur-pos<=1000)void afterTrack();
      else if(state.paused&&pos===0&&positionMax.current>30000)void afterTrack();
    },700);
    return()=>clearInterval(timer);
  },[phase,afterTrack]);

  const start=async()=>{
    if(phaseRef.current!=="idle")return;
    updatePhase("connecting");setMessage("");
    alive.current=true;
    try{
      // The user click is the autoplay gesture required by the Spotify SDK.
      if(typeof window!=="undefined"&&typeof speechSynthesis!=="undefined")speechSynthesis.cancel();
      await loadSdk();
      const spotifyPlayer=new window.Spotify.Player({name:"TRIWX 特集番組",getOAuthToken:(cb:(t:string)=>void)=>{getToken().then(cb).catch(()=>{})},volume:0.8});
      player.current=spotifyPlayer;
      const ready=new Promise<string>((resolve,reject)=>{
        spotifyPlayer.addListener("ready",({device_id}:{device_id:string})=>resolve(device_id));
        spotifyPlayer.addListener("authentication_error",({message}:{message:string})=>reject(new Error(message)));
        spotifyPlayer.addListener("account_error",()=>reject(new Error("Spotify Premiumが必要です")));
        setTimeout(()=>reject(new Error("Spotifyプレーヤー接続がタイムアウトしました")),20000);
      });
      spotifyPlayer.activateElement?.();
      if(!await spotifyPlayer.connect())throw new Error("Spotifyへ接続できません");
      deviceId.current=await ready;
      void advance(0);
    }catch(e){updatePhase("error");setMessage(e instanceof Error?e.message:String(e))}
  };
  const next=()=>{
    cancelSpeech();
    if(phaseRef.current==="playing"||phaseRef.current==="talking"){
      // If a narration is active, it is canceled before the next track.
      void (async()=>{while(busy.current)await sleep(60);if(alive.current)void advance(currentIndex.current+1)})();
    }
  };
  const togglePause=async()=>{
    if(phaseRef.current==="playing")await player.current?.togglePlay();
  };
  const restart=()=>{window.location.reload()};
  const song=program.songs[index];
  const format=(ms:number)=>`${Math.floor(ms/60000)}:${String(Math.floor(ms%60000/1000)).padStart(2,"0")}`;

  return <main style={{maxWidth:760,margin:"0 auto",padding:"24px 18px 70px",lineHeight:1.8}}>
    <a href="/" style={{textDecoration:"underline"}}>← 通常放送へ</a>
    <p style={{opacity:.65,marginTop:22}}>TRIWX SPECIAL PROGRAM</p>
    <h1 style={{fontSize:"clamp(26px,5vw,40px)",lineHeight:1.3,margin:"0 0 4px"}}>{program.title}</h1>
    <p>{program.subtitle}</p>
    <p style={{fontSize:13,opacity:.75}}>{program.notice}</p>
    {authed===false&&<a href="/api/auth/login">Spotifyでログイン</a>}
    <section style={{padding:20,border:"1px solid #8885",borderRadius:14,margin:"22px 0"}}>
      <p style={{margin:"0 0 6px",opacity:.75}}> {phase==="ended"?"放送終了":phase==="talking"?"🎙 DJ ON AIR":phase==="playing"?"♫ MUSIC ON AIR":phase==="connecting"?"接続中":"特集番組"}</p>
      <h2 style={{margin:"0 0 6px",fontSize:21}}>{index+1} / {program.songs.length}　{song.title}</h2>
      <p style={{margin:"0 0 12px"}}>{song.artist}</p>
      <p style={{fontVariantNumeric:"tabular-nums"}}>{format(progress.position)} / {format(progress.duration)}</p>
      {phase==="idle"&&<button onClick={start} disabled={authed!==true} style={{padding:"10px 20px"}}>▶ 特集番組をはじめる</button>}
      {phase==="playing"&&<button onClick={togglePause} style={{padding:"10px 14px",marginRight:10}}>{paused?"▶ 再開":"⏸ 一時停止"}</button>}
      {(phase==="playing"||phase==="talking")&&<button onClick={next} style={{padding:"10px 14px"}}>⏭ 次へ</button>}
      {(phase==="ended"||phase==="error")&&<button onClick={restart} style={{padding:"10px 14px"}}>最初から</button>}
      {phase==="error"&&<p role="alert" style={{color:"tomato"}}>{message}</p>}
      <div style={{display:"flex",alignItems:"center",gap:10,marginTop:16}}>
        <label htmlFor="voice">ナレーション</label>
        <select id="voice" value={voice} onChange={e=>setVoice(e.target.value as typeof voice)}>
          <option value="hq">高音質</option><option value="browser">ブラウザ</option><option value="off">オフ</option>
        </select>
      </div>
      {spoken&&<p style={{marginTop:15,borderTop:"1px solid #8884",paddingTop:10,fontSize:14}}>{spoken}</p>}
    </section>
    <h2>オンエア予定</h2>
    <ol style={{paddingLeft:26}}>
      {program.songs.map((s,i)=><li key={i} style={{margin:"0 0 13px",opacity:i<index?.55:1}}>
        <strong>{s.artist} — {s.title}</strong>
        <div style={{fontSize:13,opacity:.7}}>{s.context}</div>
      </li>)}
    </ol>
    <p style={{fontSize:13,opacity:.75}}>曲はSpotify Premiumのアカウントでフル尺再生します。ブラウザを閉じると終了します。台本の引用・出典は公開前に最終照合してください。</p>
  </main>;
}
