// src/engine/inserts.ts — 番組インサート（時報・ジングル・将来のニュース/天気）
//
// 拡張の口: Insert.typeを増やし、computeDueInsertsに判定を足すだけで
// 新しい挿入物（ニュース、天気、交通情報…）を曲間に差し込める。
// 音はsounds.ts、読み上げはエンジンのナレーション経路をそのまま使う。

export type Insert = {
  type: "time_signal" | "jingle"; // 将来: "news" | "weather" など
  sound: "chime" | "jingle" | null;
  text: string | null; // 画面に表示するテキスト（nullなら音のみ）
  speechText?: string | null; // 読み上げ用の読み仮名（未指定ならtextをそのまま読む）
};

export type InsertContext = {
  now: Date;
  lastAnnouncedHour: number | null; // 最後に時報を打った「次の時」(0-23)。未実施はnull
  tracksSinceJingle: number;
  jingleEvery: number; // 次のジングルまでの曲数（4〜6でランダム更新）
};

function hourLabel(h24: number): string {
  const h = ((h24 % 24) + 24) % 24;
  if (h === 0) return "午前0時";
  if (h === 12) return "正午";
  return h < 12 ? `午前${h}時` : `午後${h - 12}時`;
}

/**
 * 曲間の遷移タイミングで呼ぶ。いま差し込むべきインサートを返す。
 * - 時報: 毎時55分以降に迎えた最初の曲間で1回だけ。発話時点の残り分数を正確に告げる
 *   （曲間にしか喋れないため正時ちょうどは狙えない。だから音も言葉も時刻を断定しない）
 * - ジングル: 4〜6曲ごと。時報と同じ曲間には入れない
 */
export function computeDueInserts(ctx: InsertContext): Insert[] {
  const inserts: Insert[] = [];
  const minutes = ctx.now.getMinutes();
  const seconds = ctx.now.getSeconds();
  const upcomingHour = (ctx.now.getHours() + 1) % 24;

  if (minutes >= 55 && ctx.lastAnnouncedHour !== upcomingHour) {
    const remainMin = Math.ceil((60 * 60 - (minutes * 60 + seconds)) / 60);
    const label = hourLabel(upcomingHour);
    const text =
      remainMin <= 1
        ? `まもなく、${label}です。`
        : `${label}まで、あとおよそ${remainMin}分です。`;
    inserts.push({
      type: "time_signal",
      sound: "chime",
      text,
    });
    return inserts; // 時報の曲間にはジングルを重ねない
  }

  if (ctx.tracksSinceJingle >= ctx.jingleEvery) {
    inserts.push({
      type: "jingle",
      sound: "jingle",
      text: "TRIWX STATION",
      speechText: "ティーアールアイダブリューエックス、ステーション",
    });
  }

  return inserts;
}
