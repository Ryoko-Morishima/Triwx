// src/engine/useRadioEngine.ts — ラジオエンジン（クライアント）
//
// 責務:
// - Spotify Web Playback SDK の初期化と再生制御
// - 再生キュー（先読み2曲）の維持と補充トリガー
// - 「曲 → ナレーション → 次の曲」の状態遷移
// - 残り時間監視による曲末の検出（イベント頼みにせず、自前でスケジュール）
// - ログAPIへの状態パッチ
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QueueItem } from "@/logs/schema";
import type { StationState } from "@/pipeline/core";
import { speak, stopSpeaking, warmupTts } from "@/engine/tts";
import { playChime, playJingleIntro, playJingleSting, unlockAudio, getAudioContextForBoost } from "@/engine/sounds";
import { computeDueInserts } from "@/engine/inserts";

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: any;
  }
}

export type EngineStatus =
  | "idle" // 開始前
  | "connecting" // SDK初期化・最初の補充中
  | "playing" // 曲再生中
  | "narrating" // 曲間ナレーション中
  | "starved" // キュー枯渇（補充待ち）
  | "error";

const BUFFER_TARGET = 2; // 先読み曲数（小さいことが「変更が早く効く」体験を作る）
const FILL_TRIGGER_MS = 45_000; // 残りこの時間を切ったら補充チェック
const END_GUARD_MS = 1_000; // 曲末とみなす残り時間

export type VoiceMode = "off" | "browser" | "hq";

export function useRadioEngine(
  getState: () => StationState,
  getVoiceMode: () => VoiceMode,
  getRadioMode: () => boolean,
) {
  const [status, setStatus] = useState<EngineStatus>("idle");
  const [current, setCurrent] = useState<QueueItem | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [narrationText, setNarrationText] = useState("");
  const [position, setPosition] = useState({ ms: 0, durationMs: 0 });
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState("");

  const playerRef = useRef<any>(null);
  const deviceIdRef = useRef<string>("");
  const sessionIdRef = useRef<string>("");
  const seqRef = useRef(0);
  const queueRef = useRef<QueueItem[]>([]);
  const currentRef = useRef<QueueItem | null>(null);
  const historyRef = useRef<{ title: string; artist: string }[]>([]);
  const fillingRef = useRef(false);
  const transitioningRef = useRef(false);
  const lastFilledVersionRef = useRef(-1);
  const statusRef = useRef<EngineStatus>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAnnouncedHourRef = useRef<number | null>(null);
  const tracksSinceJingleRef = useRef(0);
  const jingleEveryRef = useRef(4 + Math.floor(Math.random() * 3));
  const stationCallRef = useRef<Promise<Blob | null> | null>(null);
  const maxPositionRef = useRef(0); // 現在曲で観測した最大再生位置（一時停止の誤終了検出防止）
  const [micFlash, setMicFlash] = useState(false);
  const micFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStatusBoth = (s: EngineStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  const setQueueBoth = (q: QueueItem[]) => {
    queueRef.current = q;
    setQueue(q);
  };

  // ---- ログ ----
  const patchLog = useCallback((id: string, patch: any) => {
    fetch("/api/log", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionIdRef.current, id, patch }),
    }).catch(() => {});
  }, []);

  // ---- ナレーション再生（モード別） ----
  const stopNarrationAudio = useCallback(() => {
    stopSpeaking();
    try {
      audioRef.current?.pause();
      audioRef.current = null;
    } catch {}
  }, []);

  const playNarration = useCallback(async (text: string) => {
    const mode = getVoiceMode();

    if (mode === "off") {
      // 間をあけず即座に次の曲へ（テキストは画面に表示され続ける）
      return;
    }

    if (mode === "hq") {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              URL.revokeObjectURL(url);
              resolve();
            };
            audio.onended = finish;
            audio.onerror = finish;
            setTimeout(finish, 40_000);
            audio.play().catch(finish);
          });
          audioRef.current = null;
          return;
        }
      } catch {}
      // 高音質が失敗したらブラウザTTSにフォールバック
    }

    await speak(text);
  }, [getVoiceMode]);

  // ---- 局名コール・インサート音声（番組演出。読み上げ設定から独立） ----
  const prefetchStationCall = useCallback(() => {
    if (stationCallRef.current) return;
    stationCallRef.current = fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "ティーアールアイダブリューエックス、ステーション" }),
    })
      .then((r) => (r.ok ? r.blob() : null))
      .catch(() => null);
  }, []);

  const playAudioBlob = useCallback((blob: Blob, gain = 1) => {
    return new Promise<void>((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      // TTS音声は素の音量が控えめなため、演出の声はゲインノードで増幅する
      if (gain > 1) {
        try {
          const ac = getAudioContextForBoost();
          if (ac) {
            const src = ac.createMediaElementSource(audio);
            const g = ac.createGain();
            g.gain.value = gain;
            src.connect(g).connect(ac.destination);
          }
        } catch {
          // 増幅に失敗しても等倍で再生される
        }
      }
      audioRef.current = audio;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        audioRef.current = null;
        resolve();
      };
      audio.onended = finish;
      audio.onerror = finish;
      setTimeout(finish, 20_000);
      audio.play().catch(finish);
    });
  }, []);

  /** ラジオ演出の発話。読み上げモードに関わらず声を出す（演出のオンオフは時報・ジングルのトグルが担う） */
  const speakInsert = useCallback(
    async (text: string) => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          await playAudioBlob(await res.blob(), 1.8);
          return;
        }
      } catch {}
      await speak(text); // 高音質が失敗したらブラウザTTS
    },
    [playAudioBlob],
  );

  const playStationCall = useCallback(async () => {
    prefetchStationCall();
    const blob = await (stationCallRef.current ?? Promise.resolve(null));
    if (blob) {
      await playAudioBlob(blob, 1.8);
    } else {
      await speak("ティーアールアイダブリューエックス、ステーション");
    }
  }, [playAudioBlob, prefetchStationCall]);

  /** マイクランプの余韻: 音を止めずに、曲間があったことを2.5秒だけ視覚に残す */
  const flashMic = useCallback(() => {
    setMicFlash(true);
    if (micFlashTimer.current) clearTimeout(micFlashTimer.current);
    micFlashTimer.current = setTimeout(() => setMicFlash(false), 2_500);
  }, []);

  // ---- 補充 ----
  const fillOne = useCallback(async (): Promise<boolean> => {
    if (fillingRef.current) return false;
    fillingRef.current = true;

    try {
      const state = getState();
      const last =
        queueRef.current.length > 0
          ? queueRef.current[queueRef.current.length - 1].track
          : currentRef.current?.track ?? null;

      const seq = seqRef.current++;

      const res = await fetch("/api/queue/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          seq,
          state,
          lastTrack: last ? { title: last.title, artist: last.artist } : null,
          history: historyRef.current.slice(-20),
        }),
      });

      if (!res.ok) return false;
      const data = await res.json();
      if (!data?.ok || !data?.item) return false;

      lastFilledVersionRef.current = state.version;
      historyRef.current.push({
        title: data.item.track.title,
        artist: data.item.track.artist,
      });
      setQueueBoth([...queueRef.current, data.item]);
      return true;
    } catch {
      return false;
    } finally {
      fillingRef.current = false;
    }
  }, [getState]);

  const ensureBuffer = useCallback(async () => {
    while (queueRef.current.length < BUFFER_TARGET) {
      const ok = await fillOne();
      if (!ok) break; // 失敗したら次のポーリング周期で再挑戦
    }
  }, [fillOne]);

  // ---- 再生 ----
  const playUri = useCallback(async (uri: string) => {
    const tokenRes = await fetch("/api/token");
    const { accessToken } = await tokenRes.json();

    await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ uris: [uri] }),
      },
    );
  }, []);

  // ---- 遷移: （現在曲終了）→ ナレーション → 次曲 ----
  const transitionToNext = useCallback(async () => {
    if (transitioningRef.current) return;
    transitioningRef.current = true;

    try {
      const prev = currentRef.current;
      if (prev) {
        patchLog(prev.id, { status: "played" });
      }

      // キューが空なら飢餓状態で待つ（サーバ側の多層フォールバックがあるため通常は即復帰）
      while (queueRef.current.length === 0) {
        setStatusBoth("starved");
        setNarrationText("（次の曲を選んでいます…）");
        const ok = await fillOne();
        if (!ok) await new Promise((r) => setTimeout(r, 2_500));
      }

      const next = queueRef.current[0];
      setQueueBoth(queueRef.current.slice(1));

      setStatusBoth("narrating");
      try {
        playerRef.current?.pause?.();
      } catch {}

      // ラジオモード: 時報・ジングル（将来: ニュース/天気もここに挿さる）
      if (getRadioMode()) {
        const inserts = computeDueInserts({
          now: new Date(),
          lastAnnouncedHour: lastAnnouncedHourRef.current,
          tracksSinceJingle: tracksSinceJingleRef.current,
          jingleEvery: jingleEveryRef.current,
        });
        for (const ins of inserts) {
          if (ins.text) setNarrationText(ins.text);
          if (ins.type === "time_signal") {
            lastAnnouncedHourRef.current = (new Date().getHours() + 1) % 24;
            await playChime();
            if (ins.text) await speakInsert(ins.text);
          } else if (ins.type === "jingle") {
            tracksSinceJingleRef.current = 0;
            jingleEveryRef.current = 4 + Math.floor(Math.random() * 3);
            await playJingleIntro();
            await playStationCall();
            await playJingleSting();
          }
        }
      }
      tracksSinceJingleRef.current += 1;

      // ナレーション（表示 + 読み上げ）
      setNarrationText(next.narration);
      await playNarration(next.narration);

      // 次曲再生
      currentRef.current = next;
      setCurrent(next);
      maxPositionRef.current = 0;
      await playUri(next.track.uri);
      flashMic();
      patchLog(next.id, { status: "playing", playedAt: new Date().toISOString() });
      setStatusBoth("playing");
      setPaused(false);

      // 裏で補充
      void ensureBuffer();
    } catch (e) {
      setMessage("遷移中にエラーが発生しました。再生を続行します。");
      setStatusBoth("playing");
    } finally {
      transitioningRef.current = false;
    }
  }, [ensureBuffer, fillOne, patchLog, playUri, playNarration, getRadioMode, speakInsert, playStationCall, flashMic]);

  // ---- ポーラー: 残り時間監視 ----
  useEffect(() => {
    if (status === "idle" || status === "error") return;

    const timer = setInterval(async () => {
      const player = playerRef.current;
      if (!player || statusRef.current !== "playing") return;

      const s = await player.getCurrentState().catch(() => null);
      if (!s) return;

      setPosition({ ms: s.position, durationMs: s.duration });
      setPaused(s.paused);
      if (s.position > maxPositionRef.current) maxPositionRef.current = s.position;

      const remaining = s.duration - s.position;

      // 補充トリガー
      if (remaining < FILL_TRIGGER_MS && queueRef.current.length < BUFFER_TARGET) {
        void ensureBuffer();
      }

      // 曲末検出（自前スケジュール: SDKの終了イベントに頼らない）
      if (!s.paused && s.duration > 0 && remaining <= END_GUARD_MS) {
        void transitionToNext();
      }
      // 自然終了してSDKが停止した場合の保険。
      // 曲の進行実績（30秒超）があるときだけ発火させ、開始直後の一時停止での誤スキップを防ぐ
      if (
        s.paused &&
        s.position === 0 &&
        currentRef.current &&
        s.duration > 0 &&
        maxPositionRef.current > 30_000
      ) {
        void transitionToNext();
      }
    }, 700);

    return () => clearInterval(timer);
  }, [status, ensureBuffer, transitionToNext]);

  // ---- 開始 ----
  const start = useCallback(async () => {
    if (statusRef.current !== "idle") return;
    setStatusBoth("connecting");
    setMessage("");
    warmupTts();
    unlockAudio(); // ユーザー操作起点でAudioContextを解錠（ジングル・時報の再生に必須）
    prefetchStationCall(); // 局名コールの音声を先読みキャッシュ（読み上げ設定から独立）
    sessionIdRef.current =
      (crypto as any).randomUUID?.() ?? String(Date.now());

    // SDKスクリプトのロード
    await new Promise<void>((resolve, reject) => {
      if (window.Spotify) return resolve();
      window.onSpotifyWebPlaybackSDKReady = () => resolve();
      const el = document.createElement("script");
      el.src = "https://sdk.scdn.co/spotify-player.js";
      el.onerror = () => reject(new Error("SDK load failed"));
      document.body.appendChild(el);
      setTimeout(() => reject(new Error("SDK load timeout")), 15_000);
    }).catch((e) => {
      setMessage(String(e));
      setStatusBoth("error");
    });

    if ((statusRef.current as EngineStatus) === "error") return;

    const player = new window.Spotify.Player({
      name: "TRIWX",
      getOAuthToken: (cb: (t: string) => void) => {
        fetch("/api/token")
          .then((r) => r.json())
          .then((d) => cb(d.accessToken))
          .catch(() => {});
      },
      volume: 0.8,
    });

    playerRef.current = player;

    const ready = new Promise<string>((resolve, reject) => {
      player.addListener("ready", ({ device_id }: any) => resolve(device_id));
      player.addListener("initialization_error", ({ message }: any) => reject(new Error(message)));
      player.addListener("authentication_error", ({ message }: any) =>
        reject(new Error("認証エラー: " + message)),
      );
      player.addListener("account_error", ({ message }: any) =>
        reject(new Error("アカウントエラー（Premiumが必要です）: " + message)),
      );
      setTimeout(() => reject(new Error("player ready timeout")), 20_000);
    });

    // モバイル等での再生許可（ユーザー操作起点で呼ぶ）
    try {
      player.activateElement?.();
    } catch {}

    const connected = await player.connect();
    if (!connected) {
      setMessage("Spotifyプレイヤーに接続できませんでした。");
      setStatusBoth("error");
      return;
    }

    try {
      deviceIdRef.current = await ready;
    } catch (e: any) {
      setMessage(e?.message ?? String(e));
      setStatusBoth("error");
      return;
    }

    // 開局のサウンドロゴ（選曲は裏で走らせて待ち時間を隠す）
    setStatusBoth("narrating");
    const firstFill = fillOne();
    if (getRadioMode()) {
      setNarrationText("TRIWX STATION");
      tracksSinceJingleRef.current = 0;
      await playJingleIntro();
      await playStationCall();
      await playJingleSting();
    } else {
      setNarrationText("（選曲しています…）");
    }

    const ok = await firstFill;
    if (!ok) {
      setMessage("最初の選曲に失敗しました。APIキーとネットワークを確認して、もう一度お試しください。");
      setStatusBoth("error");
      return;
    }

    void transitionToNext();
  }, [fillOne, transitionToNext, getRadioMode, playStationCall, prefetchStationCall]);

  // ---- 操作 ----
  const skip = useCallback(() => {
    const cur = currentRef.current;
    if (cur) patchLog(cur.id, { status: "skipped" });
    stopNarrationAudio();
    void transitionToNext();
  }, [patchLog, transitionToNext, stopNarrationAudio]);

  const togglePause = useCallback(async () => {
    try {
      await playerRef.current?.togglePlay?.();
    } catch {}
  }, []);

  /** カード・スライダー変更の確定時に呼ばれる。旧条件でバッファ済みの曲を1曲だけ残して捨て、
      新しい方針での補充を裏で始める（変更が効くまでの体感遅延の短縮） */
  const noteStateChanged = useCallback(() => {
    if (queueRef.current.length > 1) {
      setQueueBoth(queueRef.current.slice(0, 1));
    }
    void ensureBuffer();
  }, [ensureBuffer]);

  const sendFeedback = useCallback(
    (rating: "good" | "ok" | "bad" | null, memo: string, targetId?: string) => {
      const id = targetId ?? currentRef.current?.id;
      if (!id) return;
      patchLog(id, { feedback: { rating, memo } });
    },
    [patchLog],
  );

  return {
    status,
    current,
    queue,
    narrationText,
    position,
    paused,
    message,
    micFlash,
    noteStateChanged,
    sessionId: sessionIdRef,
    start,
    skip,
    togglePause,
    sendFeedback,
  };
}
