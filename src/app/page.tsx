// src/app/page.tsx — ラジオ画面（深夜のトランジスタ意匠）
// ロジックは従来と同一。見た目のみ:
// - FM周波数ダイアル = 再生プログレス（年代スライダーとは無関係）
// - スライダー = フェーダー（現在の帯ラベルを生表示）
// - カード = 紙。選択カードは本体スロットに挿さり、下段はカードボックス
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  moodCards,
  regionCards,
  isRegionCard,
  getCard,
  sliders,
  getSliderBand,
  conflictsWith,
  MAX_PERSONALITY_CARDS,
  MAX_REGION_CARDS,
  type SliderId,
} from "@/pipeline/definitions";
import type { StationState } from "@/pipeline/core";
import { useRadioEngine, type VoiceMode } from "@/engine/useRadioEngine";

const defaultSliders = Object.fromEntries(
  sliders.map((s) => [s.id, s.defaultValue]),
) as Record<SliderId, number>;

const cardGroups: { key: string; label: string; ids: string[] }[] = [
  { key: "time", label: "時間・天気", ids: moodCards.filter((c) => c.group === "time").map((c) => c.id) },
  { key: "scene", label: "シーン", ids: moodCards.filter((c) => c.group === "scene").map((c) => c.id) },
  { key: "mood", label: "気分・質感", ids: moodCards.filter((c) => c.group === "mood").map((c) => c.id) },
  { key: "region", label: "ことば・地域", ids: regionCards.map((c) => c.id) },
];

export default function Page() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [cards, setCards] = useState<string[]>([]);
  const [sliderValues, setSliderValues] = useState<Record<SliderId, number>>(defaultSliders);
  const [memo, setMemo] = useState("");
  const [rating, setRating] = useState<"good" | "ok" | "bad" | null>(null);
  const [saved, setSaved] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("hq");
  const voiceModeRef = useRef<VoiceMode>("hq");
  const [radioMode, setRadioMode] = useState(true);
  const radioModeRef = useRef(true);
  const toggleRadioMode = () => {
    radioModeRef.current = !radioModeRef.current;
    setRadioMode(radioModeRef.current);
  };
  const changeVoiceMode = (m: VoiceMode) => {
    voiceModeRef.current = m;
    setVoiceMode(m);
  };

  const stateRef = useRef<StationState>({ version: 0, cards: [], sliders: defaultSliders });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const engineNoteRef = useRef<() => void>(() => {});
  const sessionIdForWarmRef = useRef<{ current: string } | null>(null);

  const bumpState = useCallback((nextCards: string[], nextSliders: Record<SliderId, number>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      stateRef.current = {
        version: stateRef.current.version + 1,
        cards: nextCards,
        sliders: nextSliders,
      };
      // 方針の事前ウォームアップ（失敗しても実害なし）
      const sid = sessionIdForWarmRef.current?.current;
      if (sid) {
        fetch("/api/queue/warm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid, state: stateRef.current }),
        }).catch(() => {});
      }
      // 旧条件のバッファ整理と先読み
      engineNoteRef.current();
    }, 500);
  }, []);

  const getState = useCallback(() => stateRef.current, []);
  const getVoiceMode = useCallback(() => voiceModeRef.current, []);
  const getRadioMode = useCallback(() => radioModeRef.current, []);
  const engine = useRadioEngine(getState, getVoiceMode, getRadioMode);
  engineNoteRef.current = engine.noteStateChanged;
  sessionIdForWarmRef.current = engine.sessionId;

  useEffect(() => {
    fetch("/api/token")
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    setMemo("");
    setRating(null);
    setSaved(false);
  }, [engine.current?.id]);

  const toggleCard = (id: string) => {
    setCards((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((c) => c !== id);
        bumpState(next, sliderValues);
        return next;
      }

      const isRegion = isRegionCard(id);
      // ことば・地域カードは1枚のみ（選ぶと既存の地域カードと差し替わる）
      let base = isRegion ? prev.filter((c) => !isRegionCard(c)) : prev;

      // 性格カードの排他ペア（doze×dance 等）は既選択側を自動で外す
      if (!isRegion) {
        const conflicts = conflictsWith(id, base);
        if (conflicts.length) base = base.filter((c) => !conflicts.includes(c));
      }

      const sameGroupCount = base.filter((c) => isRegionCard(c) === isRegion).length;
      const limit = isRegion ? MAX_REGION_CARDS : MAX_PERSONALITY_CARDS;
      if (sameGroupCount >= limit) {
        bumpState(base === prev ? prev : base, sliderValues);
        return base === prev ? prev : base;
      }
      const next = [...base, id];
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
  const durSec = engine.position.durationMs > 0 ? engine.position.durationMs / 1000 : 0;
  const posSec = Math.min(engine.position.ms / 1000, durSec);
  const fmtTime = (sec: number) =>
    `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
  const tickCount = durSec > 0 ? Math.max(4, Math.floor(durSec / 15)) : 12;
  const minuteMarks =
    durSec > 0
      ? Array.from({ length: Math.floor(durSec / 60) + 1 }, (_, i) => i)
      : [0, 1, 2, 3];
  const onAir = engine.status === "narrating" || engine.status === "starved" || engine.micFlash;
  const live = engine.status === "playing" || engine.status === "narrating" || engine.status === "starved";

  return (
    <main className="wrap">
      <div className="radio">
        {/* 上部: ロゴとランプ */}
        <div className="radio-top">
          <span className="logo">TRIWX</span>
          <span className={`lamp ${onAir ? "lit" : live ? "on" : ""}`}>
            <span className="lamp-dot" />
            {engine.status === "starved" ? "選局中" : onAir ? "マイク" : live ? "音楽" : "停波"}
          </span>
        </div>

        {/* 文字盤 */}
        <div className="dial">
          <div className="dial-scale">
            <div className="dial-ticks">
              {Array.from({ length: tickCount + 1 }).map((_, i) => {
                const sec = i * 15;
                const left = durSec > 0 ? Math.min(100, (sec / durSec) * 100) : (i / tickCount) * 100;
                return (
                  <i
                    key={i}
                    className={sec % 60 === 0 ? "tall" : ""}
                    style={{ left: `${left}%` }}
                  />
                );
              })}
              {minuteMarks.map((m) => {
                const left =
                  durSec > 0
                    ? Math.min(100, ((m * 60) / durSec) * 100)
                    : (m / Math.max(1, minuteMarks.length - 1)) * 100;
                return (
                  <span key={m} className="dial-num" style={{ left: `${left}%` }}>
                    {m}
                  </span>
                );
              })}
              {live && t && <div className="needle" style={{ left: `${pct}%` }} />}
            </div>
            <div className="dial-readout">
              {live && t ? `${fmtTime(posSec)} / ${fmtTime(durSec)}` : "—:—— / —:——"}
            </div>
          </div>

          {authed === false && (
            <div className="dial-center">
              <p className="dial-note">まずSpotifyにログインしてください（Premiumアカウント）</p>
              <a className="key wide" href="/api/auth/login">Spotifyでログイン</a>
            </div>
          )}
          {authed && engine.status === "idle" && (
            <div className="dial-center">
              <p className="dial-note">スイッチを入れると、音楽が流れ続けます</p>
              <button className="key wide" onClick={engine.start}>▶ 放送をはじめる</button>
            </div>
          )}
          {engine.status === "connecting" && (
            <div className="dial-center"><p className="dial-note">受信をはじめています…</p></div>
          )}
          {engine.status === "error" && (
            <div className="dial-center">
              <p className="dial-note error">{engine.message || "エラーが発生しました。"}</p>
              <button className="key wide" onClick={() => location.reload()}>リロード</button>
            </div>
          )}
          {live && t && (
            <div className="dial-center">
              <div className="track-title">{t.title}</div>
              <div className="track-sub">
                {t.artist}
                {t.year ? ` ・ ${t.year}` : ""}
                {t.album ? ` ・ ${t.album}` : ""}
              </div>
            </div>
          )}
        </div>

        {/* ナレーション窓 */}
        {live && (
          <div className={`narr ${onAir || engine.status === "starved" ? "on" : ""}`}>
            <span className="narr-mic">🎙</span>
            <span>{engine.narrationText || "…"}</span>
          </div>
        )}

        {/* 操作列 */}
        {live && (
          <div className="panel-row">
            <button className="key" onClick={engine.togglePause}>
              {engine.paused ? "▶ 再開" : "⏸ 一時停止"}
            </button>
            <button className="key" onClick={engine.skip}>⏭ 次の曲へ</button>
            <button
              className={`key small ${radioMode ? "down" : ""}`}
              onClick={toggleRadioMode}
              title="時報とジングルを入れる"
            >
              {radioMode ? "🔔 時報・ジングル: オン" : "🔕 時報・ジングル: オフ"}
            </button>
            <div className="voice">
              <span className="voice-label">読み上げ</span>
              {(
                [
                  ["off", "オフ"],
                  ["browser", "標準"],
                  ["hq", "高音質"],
                ] as [VoiceMode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  className={`key small ${voiceMode === m ? "down" : ""}`}
                  onClick={() => changeVoiceMode(m)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 評価 */}
        {live && t && (
          <div className="panel-row feedback">
            <span className="fb-label">カードに合ってる?</span>
            <button className={`stamp ${rating === "good" ? "on" : ""}`} title="合ってる" onClick={() => saveFeedback("good")}>◎</button>
            <button className={`stamp ${rating === "ok" ? "on" : ""}`} title="どちらとも" onClick={() => saveFeedback("ok")}>○</button>
            <button className={`stamp ${rating === "bad" ? "on" : ""}`} title="合ってない（好き嫌いではなく、いまのカードに合うかどうか）" onClick={() => saveFeedback("bad")}>✕</button>
            <input
              className="memo"
              placeholder="メモを書き込む"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onBlur={() => rating && saveFeedback(rating)}
            />
            {saved && <span className="saved">記録済み</span>}
          </div>
        )}

        {/* このあと */}
        {live && (
          <div className="queue">
            <span className="queue-label">このあと</span>
            {engine.queue.length === 0 && <span className="queue-item dim">選曲中…</span>}
            {engine.queue.map((q) => (
              <span key={q.id} className="queue-item">
                {q.track.title} / {q.track.artist}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 挿さっているカード */}
      <div className="slot-row">
        {cards.length === 0 && <span className="slot-hint">下の箱からカードを選ぶと、ここに挿さります</span>}
        {cards.map((id, i) => {
          const c = getCard(id);
          if (!c) return null;
          return (
            <button
              key={id}
              className={`slotted ${isRegionCard(id) ? "region" : ""}`}
              style={{ transform: `rotate(${i % 2 === 0 ? -1.2 : 1.1}deg)` }}
              onClick={() => toggleCard(id)}
              title="外す"
            >
              {c.label}
              <span className="slotted-x">×</span>
            </button>
          );
        })}
      </div>

      {/* カードボックス */}
      <div className="cardbox">
        {cardGroups.map((g) => (
          <div key={g.key} className="card-group">
            <span className="group-label">{g.label}</span>
            <div className="card-tabs">
              {g.ids.map((id) => {
                const c = getCard(id)!;
                const sel = cards.includes(id);
                return (
                  <button
                    key={id}
                    className={`tab ${g.key === "region" ? "region" : ""} ${sel ? "sel" : ""}`}
                    onClick={() => toggleCard(id)}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* フェーダー */}
        <div className="faders">
          {sliders.map((s) => {
            const band = getSliderBand(s.id, sliderValues[s.id]);
            return (
              <div key={s.id} className="fader-row">
                <span className="f-name">{s.label}</span>
                <span className="f-side">{s.leftLabel}</span>
                <input
                  className="fader"
                  type="range"
                  min={0}
                  max={100}
                  value={sliderValues[s.id]}
                  onChange={(e) => changeSlider(s.id, Number(e.target.value))}
                />
                <span className="f-side">{s.rightLabel}</span>
                <span className={`f-band ${band.label === "指定なし" || band.label === "中間" ? "neutral" : ""}`}>
                  {band.label}
                </span>
              </div>
            );
          })}
          <p className="hint">カードとフェーダーの変更は、次の選曲から効きはじめます。</p>
        </div>
      </div>
    </main>
  );
}
