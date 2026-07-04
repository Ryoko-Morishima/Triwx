// src/app/page.tsx — ラジオ画面
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { moodCards, regionCards, isRegionCard, sliders, type SliderId } from "@/pipeline/definitions";
import type { StationState } from "@/pipeline/core";
import { useRadioEngine, type VoiceMode } from "@/engine/useRadioEngine";

const defaultSliders = Object.fromEntries(
  sliders.map((s) => [s.id, s.defaultValue]),
) as Record<SliderId, number>;

export default function Page() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [cards, setCards] = useState<string[]>([]);
  const [sliderValues, setSliderValues] = useState<Record<SliderId, number>>(defaultSliders);
  const [memo, setMemo] = useState("");
  const [rating, setRating] = useState<"good" | "ok" | "bad" | null>(null);
  const [saved, setSaved] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("hq");
  const voiceModeRef = useRef<VoiceMode>("hq");
  const changeVoiceMode = (m: VoiceMode) => {
    voiceModeRef.current = m;
    setVoiceMode(m);
  };

  // 卓の状態: 変更のたびに version++（500msデバウンス）
  const stateRef = useRef<StationState>({ version: 0, cards: [], sliders: defaultSliders });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpState = useCallback((nextCards: string[], nextSliders: Record<SliderId, number>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      stateRef.current = {
        version: stateRef.current.version + 1,
        cards: nextCards,
        sliders: nextSliders,
      };
    }, 500);
  }, []);

  const getState = useCallback(() => stateRef.current, []);
  const getVoiceMode = useCallback(() => voiceModeRef.current, []);
  const engine = useRadioEngine(getState, getVoiceMode);

  useEffect(() => {
    fetch("/api/token")
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  // 曲が替わったら評価欄をリセット
  useEffect(() => {
    setMemo("");
    setRating(null);
    setSaved(false);
  }, [engine.current?.id]);

  const toggleCard = (id: string) => {
    setCards((prev) => {
      const isRegion = isRegionCard(id);
      const sameGroupCount = prev.filter((c) => isRegionCard(c) === isRegion).length;
      const limit = isRegion ? 2 : 3;
      const next = prev.includes(id)
        ? prev.filter((c) => c !== id)
        : sameGroupCount >= limit
          ? prev
          : [...prev, id];
      bumpState(next, sliderValues);
      return next;
    });
  };

  const changeSlider = (id: SliderId, value: number) => {
    setSliderValues((prev) => {
      const next = { ...prev, [id]: value };
      bumpState(cards, next);
      return next;
    });
  };

  const saveFeedback = (r: "good" | "ok" | "bad" | null) => {
    setRating(r);
    engine.sendFeedback(r, memo);
    setSaved(true);
  };

  const t = engine.current?.track;
  const pct =
    engine.position.durationMs > 0
      ? Math.min(100, (engine.position.ms / engine.position.durationMs) * 100)
      : 0;

  return (
    <main className="wrap">
      <header>
        <h1>TRIWX</h1>
        <p className="sub">AI選曲・連続ラジオ（MVP）</p>
      </header>

      {authed === false && (
        <section className="panel center">
          <p>まずSpotifyにログインしてください（Premiumアカウント）。</p>
          <a className="btn primary" href="/api/auth/login">Spotifyでログイン</a>
        </section>
      )}

      {authed && engine.status === "idle" && (
        <section className="panel center">
          <p>準備ができました。ラジオを始めると音楽が流れ続けます。</p>
          <button className="btn primary" onClick={engine.start}>▶ ラジオを始める</button>
        </section>
      )}

      {engine.status === "connecting" && (
        <section className="panel center"><p>接続しています…</p></section>
      )}

      {engine.status === "error" && (
        <section className="panel center">
          <p className="error">{engine.message || "エラーが発生しました。"}</p>
          <button className="btn" onClick={() => location.reload()}>リロード</button>
        </section>
      )}

      {(engine.status === "playing" ||
        engine.status === "narrating" ||
        engine.status === "starved") && (
        <>
          <section className="panel now">
            {engine.status !== "playing" && (
              <div className="narration on-air">
                <span className="mic">🎙</span> {engine.narrationText}
              </div>
            )}
            {engine.status === "playing" && engine.narrationText && (
              <div className="narration dim">
                <span className="mic">🎙</span> {engine.narrationText}
              </div>
            )}

            {t && (
              <div className="track">
                <div className="title">{t.title}</div>
                <div className="artist">
                  {t.artist}
                  {t.year ? ` ・ ${t.year}` : ""}
                </div>
                <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
              </div>
            )}

            <div className="controls">
              <button className="btn" onClick={engine.togglePause}>
                {engine.paused ? "▶ 再開" : "⏸ 一時停止"}
              </button>
              <button className="btn" onClick={engine.skip}>⏭ スキップ</button>
              <div className="voice-toggle">
                <span className="fb-label">読み上げ:</span>
                {([
                  ["off", "オフ"],
                  ["browser", "標準"],
                  ["hq", "高音質"],
                ] as [VoiceMode, string][]).map(([m, label]) => (
                  <button
                    key={m}
                    className={`btn vt ${voiceMode === m ? "sel" : ""}`}
                    onClick={() => changeVoiceMode(m)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="feedback">
              <span className="fb-label">この曲:</span>
              <button className={`btn fb ${rating === "good" ? "sel" : ""}`} onClick={() => saveFeedback("good")}>◎</button>
              <button className={`btn fb ${rating === "ok" ? "sel" : ""}`} onClick={() => saveFeedback("ok")}>○</button>
              <button className={`btn fb ${rating === "bad" ? "sel" : ""}`} onClick={() => saveFeedback("bad")}>✕</button>
              <input
                className="memo"
                placeholder="メモ（任意）"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                onBlur={() => rating && saveFeedback(rating)}
              />
              {saved && <span className="saved">記録済み</span>}
            </div>
          </section>

          <section className="panel queue">
            <div className="q-label">このあと</div>
            {engine.queue.length === 0 && <div className="q-item dim">（選曲中…）</div>}
            {engine.queue.map((q) => (
              <div key={q.id} className="q-item">
                {q.track.title} <span className="dim">/ {q.track.artist}</span>
              </div>
            ))}
          </section>
        </>
      )}

      <section className="panel deck">
        <div className="deck-title">雰囲気カード <span className="dim">（最大3枚・再生中に変更可）</span></div>
        <div className="cards">
          {moodCards.map((c) => (
            <button
              key={c.id}
              className={`card ${cards.includes(c.id) ? "sel" : ""}`}
              onClick={() => toggleCard(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="deck-title" style={{ marginTop: 20 }}>
          ことば・地域 <span className="dim">（最大2枚・選ぶとその地域から選曲）</span>
        </div>
        <div className="cards">
          {regionCards.map((c) => (
            <button
              key={c.id}
              className={`card region ${cards.includes(c.id) ? "sel" : ""}`}
              onClick={() => toggleCard(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="deck-title" style={{ marginTop: 20 }}>調整スライダー</div>
        {sliders.map((s) => (
          <div key={s.id} className="slider-row">
            <span className="s-name">{s.label}</span>
            <span className="s-side">{s.leftLabel}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={sliderValues[s.id]}
              onChange={(e) => changeSlider(s.id, Number(e.target.value))}
            />
            <span className="s-side">{s.rightLabel}</span>
          </div>
        ))}
        <p className="hint">変更は「次の選曲」から効きはじめ、流れが少しずつ変わっていきます。</p>
      </section>
    </main>
  );
}
