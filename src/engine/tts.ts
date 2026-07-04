// src/engine/tts.ts — SpeechSynthesisの薄いラッパ
// 読み上げ完了でresolveするPromiseを返す。失敗・非対応時も止まらず即resolve。

let voicesReady = false;

function pickJaVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "ja-JP" && /Google|Kyoko|O-Ren|Otoya/i.test(v.name)) ??
    voices.find((v) => v.lang?.startsWith("ja")) ??
    null
  );
}

export function warmupTts() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  // voicesは非同期ロードのことがある
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    voicesReady = true;
  };
}

export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) {
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(text);
      const voice = pickJaVoice();
      if (voice) u.voice = voice;
      u.lang = "ja-JP";
      u.rate = 1.05;
      u.pitch = 1.0;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };

      u.onend = finish;
      u.onerror = finish;
      // 保険: 発話1文字あたり~250ms + 3s を上限に必ず先へ進む
      setTimeout(finish, Math.min(25_000, text.length * 250 + 3_000));

      window.speechSynthesis.speak(u);
    } catch {
      resolve();
    }
  });
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}
