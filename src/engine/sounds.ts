// src/engine/sounds.ts — WebAudioによる合成サウンド（音源ファイル不要）
//
// 重要: AudioContextはユーザー操作（放送開始ボタン）の時点で1つだけ生成して使い回す。
// 再生のたびに新規生成すると、ブラウザの自動再生ポリシーでsuspendedのまま音が出ない
// （ジングル不再生バグの原因）。unlockAudio()を開始時に必ず呼ぶこと。

let shared: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    const AC = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!shared) shared = new AC();
    return shared;
  } catch {
    return null;
  }
}

/** ユーザー操作の中で呼ぶ（放送開始時）。コンテキストを起こして無音を1発鳴らし解錠する */
export function unlockAudio() {
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume().catch(() => {});
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.02);
  } catch {}
}

/** 音声要素の増幅（ゲイン>1）用に共有コンテキストを渡す。suspendedなら起こす */
export function getAudioContextForBoost(): AudioContext | null {
  const ac = getCtx();
  if (ac && ac.state === "suspended") ac.resume().catch(() => {});
  return ac;
}

async function ready(): Promise<AudioContext | null> {
  const ac = getCtx();
  if (!ac) return null;
  if (ac.state === "suspended") {
    try {
      await ac.resume();
    } catch {}
  }
  return ac;
}

function tone(
  ac: AudioContext,
  freq: number,
  startSec: number,
  durSec: number,
  type: OscillatorType,
  gainVal: number,
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + startSec;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(gainVal, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durSec + 0.05);
}

/** 時報の合図（約2.6秒）: 柔らかい鐘。
    かつての「プ・プ・プ・ポーン」は秒単位の正確さを主張する音なので、
    正時ちょうどに鳴らせない本アプリでは嘘になる（ユーザー指摘）。
    時刻を断定しない、余韻のある一打に変更 */
export async function playChime(): Promise<void> {
  const ac = await ready();
  if (!ac) return;
  tone(ac, 659.25, 0.0, 2.4, "sine", 0.17); // E5
  tone(ac, 987.77, 0.0, 2.0, "sine", 0.09); // B5（倍音のきらめき）
  tone(ac, 329.63, 0.0, 2.4, "sine", 0.07); // E4（胴鳴り）
  tone(ac, 659.25, 0.9, 1.6, "sine", 0.08); // 残響のうねり
  await new Promise((r) => setTimeout(r, 2600));
}

/** FM局のサウンドロゴ・前半（約1.9秒）: 柔らかいパッドの上で、きらめく上昇モチーフ+エコー */
export async function playJingleIntro(): Promise<void> {
  const ac = await ready();
  if (!ac) return;
  // パッド: Dメジャーの持続和音
  tone(ac, 293.66, 0.0, 1.9, "sine", 0.05); // D4
  tone(ac, 369.99, 0.0, 1.9, "sine", 0.045); // F#4
  tone(ac, 440.0, 0.0, 1.9, "sine", 0.045); // A4
  // モチーフ: D5 → A5 → B5 → F#6（各音にエコー）
  const motif: [number, number][] = [
    [587.33, 0.0],
    [880.0, 0.18],
    [987.77, 0.38],
    [1479.98, 0.6],
  ];
  for (const [f, t] of motif) {
    tone(ac, f, t, 0.42, "triangle", 0.17);
    tone(ac, f, t + 0.22, 0.36, "triangle", 0.06); // エコー
  }
  await new Promise((r) => setTimeout(r, 1900));
}

/** サウンドロゴ・後半（約1.2秒）: 局名コールを受ける締めのスパークル */
export async function playJingleSting(): Promise<void> {
  const ac = await ready();
  if (!ac) return;
  tone(ac, 1479.98, 0.0, 0.22, "triangle", 0.14); // F#6
  tone(ac, 2349.32, 0.12, 0.8, "triangle", 0.13); // D7
  tone(ac, 1174.66, 0.12, 0.8, "sine", 0.07); // D6（下支え）
  await new Promise((r) => setTimeout(r, 1150));
}

/** 旧API互換（未使用化予定）: intro→stingを連続再生 */
export async function playJingle(): Promise<void> {
  await playJingleIntro();
  await playJingleSting();
}
