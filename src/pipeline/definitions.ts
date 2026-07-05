// src/pipeline/definitions.ts
//
// カード・スライダーの意味定義の【単一ソース】。
// UI表示・選曲プロンプト・（将来の）評価ゲートはすべてここを参照する。
// 「生成と評価で語彙が割れる」事故を初日から予防するための設計。

export type MoodCard = {
  id: string;
  label: string;
  promptText: string; // 選曲AIに渡す解釈文
  group?: "time" | "scene" | "mood"; // UI表示用の仕切り（選曲ロジックには不使用）
};

export const moodCards: MoodCard[] = [
  // ---- 時間・天気 ----
  { id: "morning", group: "time", label: "朝", promptText: "一日のはじまりの澄んだ空気。軽やかで清潔感のある音。重すぎない。" },
  { id: "afternoon", group: "time", label: "昼下がり", promptText: "午後のゆるんだ時間。力の抜けたミッドテンポ、日だまりのような音色。" },
  { id: "dusk", group: "time", label: "夕暮れ", promptText: "昼と夜の境目。オレンジ色の光のような、少し感傷的で美しい曲。" },
  { id: "midnight", group: "time", label: "夜更け", promptText: "深夜の空気。音数が少なめ、残響、静けさの中の親密さ。BPMは控えめでよい。" },
  { id: "rain", group: "time", label: "雨", promptText: "雨の日の質感。しっとりした音像、内省、窓の外を眺めるような距離感。" },
  { id: "sunny_holiday", group: "time", label: "晴れた休日", promptText: "予定のない晴れた日の開放感。屋外の光を感じる、気持ちのいい曲。" },
  // ---- シーン ----
  { id: "drive", group: "scene", label: "ドライブ", promptText: "走行感のあるグルーヴ。一定のリズム、前に進む推進力、風景が流れる感じ。" },
  { id: "focus", group: "scene", label: "作業・集中", promptText: "集中を妨げない曲。歌が主張しすぎない、または器楽中心。一定の質感が続く。" },
  { id: "kitchen", group: "scene", label: "料理・家事", promptText: "手を動かしながら聴いて楽しい曲。軽快なリズム、鼻歌を誘うメロディ。" },
  { id: "gathering", group: "scene", label: "集い", promptText: "人が集まる場のBGM。会話を邪魔しない華やかさ、機嫌のいいグルーヴ。" },
  // ---- 気分・質感 ----
  { id: "dance", group: "mood", label: "踊れる", promptText: "ビートで体を動かさせる曲。ダンスミュージック、ファンク、ディスコ、ハウス、アフロビート、ダンサブルなポップ/R&Bなど。テンポが速いだけのロックや、ビートの弱いギターポップは不可。" },
  { id: "uplift", group: "mood", label: "高揚", promptText: "気分が上がっていく感じ。開放感のあるコーラスやビルドアップ、ただし騒がしすぎない。" },
  { id: "doze", group: "mood", label: "まどろみ", promptText: "眠りに落ちる手前の心地よさ。アンビエント寄り、柔らかい輪郭、急な展開がない曲。" },
  { id: "bittersweet", group: "mood", label: "切なさ", promptText: "甘さと痛みが同居する感情。マイナーとメジャーの揺らぎ、郷愁を誘うメロディ。" },
  { id: "romance", group: "mood", label: "ロマンチック", promptText: "甘く親密なムード。ソウル、スロージャム、美しいバラードやボサノバ。" },
  { id: "grit", group: "mood", label: "ざらつき", promptText: "歪んだギターや荒い録音の質感。ガレージ、パンク、オルタナ、生々しいエネルギー。" },
  { id: "nostalgia", group: "mood", label: "ノスタルジー", promptText: "懐かしさ。録音の質感やアレンジに時代の匂いがある曲。世代の記憶に触れる感じ。" },
  { id: "city", group: "mood", label: "都会", promptText: "都市の夜景や雑踏の洗練。シティポップ、ネオソウル、洒脱で少しクールな質感。" },
  { id: "nature", group: "mood", label: "自然", promptText: "屋外の開けた空気。アコースティックな手触り、土や光を感じるオーガニックな音。" },
  { id: "experimental", group: "mood", label: "実験的", promptText: "定型から外れる面白さ。変わった構成・音色・リズム。ただし聴きやすさは完全には捨てない。" },
];

// ---- ことば・地域カード ----
// 西洋音楽への偏りを崩すための独立カテゴリ。選択時は「厳守条件」として選曲AIに渡す。

export const regionCards: MoodCard[] = [
  {
    id: "lang_ja",
    label: "日本語",
    promptText:
      "日本語で歌われる曲だけを選ぶ。J-POP、シティポップ、歌謡曲、日本のロック・インディー・R&Bなど幅広く。",
  },
  {
    id: "kr",
    label: "韓国",
    promptText:
      "韓国のアーティストの曲だけを選ぶ。K-POPに限らず、韓国のインディー、R&B、バラード、ヒップホップも含めてよい。",
  },
  {
    id: "asia",
    label: "アジア",
    promptText:
      "日本・韓国以外のアジア圏（台湾、香港、タイ、インドネシア、フィリピン、ベトナム、インドなど）のアーティストの曲だけを選ぶ。",
  },
  {
    id: "latin",
    label: "ラテン",
    promptText:
      "中南米やスペイン語圏・ポルトガル語圏のアーティストの曲だけを選ぶ。ボサノバ、サルサ、クンビア、レゲトン、現代のラテンインディーまで幅広く。",
  },
  {
    id: "africa",
    label: "アフリカ",
    promptText:
      "アフリカ各国のアーティストの曲だけを選ぶ。アフロビーツ、ハイライフ、スークース、エチオジャズ、砂漠のブルースなど。",
  },
  {
    id: "europe",
    label: "欧州（非英語）",
    promptText:
      "英語圏以外のヨーロッパ（フランス、ドイツ、イタリア、北欧、東欧など）のアーティストの、主に現地語で歌われる曲だけを選ぶ。",
  },
  {
    id: "world_trip",
    label: "世界を旅する",
    promptText:
      "毎回ちがう意外な国のアーティストから選ぶ。英語圏と日本の有名曲は避ける。まだ流れていない国を優先し、その国ならではの音を持つ曲を選ぶ。",
  },
];

export function getCard(id: string): MoodCard | undefined {
  return moodCards.find((c) => c.id === id) ?? regionCards.find((c) => c.id === id);
}

export function isRegionCard(id: string): boolean {
  return regionCards.some((c) => c.id === id);
}

// ---- スライダー ----

export type SliderId = "era" | "heat" | "popularity";

export type SliderBand = {
  min: number;
  max: number;
  label: string;
  promptText: string; // 具体値込みでAIに渡す文（曖昧語だけにしない）
  yearRange?: { minYear?: number; maxYear?: number }; // eraのみ: 解決後の検証に使うハード制約
};

export type SliderDef = {
  id: SliderId;
  label: string;
  leftLabel: string;
  rightLabel: string;
  defaultValue: number;
  bands: SliderBand[]; // min<=v<=max で最初に一致したもの
};

export const sliders: SliderDef[] = [
  {
    id: "era",
    label: "年代感",
    leftLabel: "古い",
    rightLabel: "新しい",
    defaultValue: 50,
    bands: [
      { min: 0, max: 19, label: "かなり古め", promptText: "1975年以前のリリース曲だけから選ぶ。", yearRange: { maxYear: 1975 } },
      { min: 20, max: 39, label: "やや古め", promptText: "1970〜1999年のリリース曲だけから選ぶ。", yearRange: { minYear: 1970, maxYear: 1999 } },
      { min: 40, max: 60, label: "指定なし", promptText: "年代は自由。流れに合うものを選ぶ。" },
      { min: 61, max: 80, label: "やや新しめ", promptText: "2005年以降のリリース曲だけから選ぶ。", yearRange: { minYear: 2005 } },
      { min: 81, max: 100, label: "新しめ", promptText: "2018年以降のリリース曲だけから選ぶ。", yearRange: { minYear: 2018 } },
    ],
  },
  {
    id: "heat",
    label: "温度感",
    leftLabel: "クール",
    rightLabel: "ホット",
    defaultValue: 50,
    bands: [
      { min: 0, max: 19, label: "クール", promptText: "感情表現が抑制された曲だけを選ぶ。抑えたボーカルや無表情な歌い方、余白のある音像、冷たく硬質な音色。熱唱・叫び・汗を感じる演奏は不可。" },
      { min: 20, max: 39, label: "ややクール", promptText: "感情を内に秘めた、落ち着いた温度の曲を中心に。洗練と距離感を保つ。" },
      { min: 40, max: 60, label: "指定なし", promptText: "温度感は自由。" },
      { min: 61, max: 80, label: "ややホット", promptText: "感情が声や演奏に乗りはじめ、身体の動きを感じる曲を中心に。" },
      { min: 81, max: 100, label: "ホット", promptText: "感情がはっきり声と演奏に乗り、肉体感・汗・熱気を伴う曲だけを選ぶ。ソウルフルな熱唱、粘るグルーヴ、生々しい演奏。無機質・淡白・無感情な曲は不可。" },
    ],
  },
  {
    id: "popularity",
    label: "人気度",
    leftLabel: "深掘り",
    rightLabel: "定番",
    defaultValue: 50,
    bands: [
      { min: 0, max: 19, label: "深掘り", promptText: "誰もが知る有名曲・代表曲・シングルヒットは不可。有名アーティストならシングルカットされていないアルバム曲や深いカタログから、あるいは広く知られていないアーティストから選ぶ。「インディーの定番」も定番なので避ける。" },
      { min: 20, max: 39, label: "やや深掘り", promptText: "大ヒット曲・代表曲は避けめにし、アルバム曲や準知名度の曲を多めに混ぜる。" },
      { min: 40, max: 60, label: "指定なし", promptText: "人気度は自由。ただし誰もが知る大定番ばかりに寄せず、知名度に幅を持たせる。" },
      { min: 61, max: 80, label: "やや定番", promptText: "広く知られた曲を中心に選ぶ。" },
      { min: 81, max: 100, label: "定番", promptText: "誰もが知る有名曲・代表曲を中心に選ぶ。" },
    ],
  },
];

/** eraスライダー値に対応する年レンジ（なければnull）。生成と検証の共通定義 */
export function eraYearRange(eraValue: number): { minYear?: number; maxYear?: number } | null {
  return getSliderBand("era", eraValue).yearRange ?? null;
}

export function yearInRange(
  year: number | null,
  range: { minYear?: number; maxYear?: number },
): boolean {
  if (year == null) return false; // レンジ指定があるのに年不明の曲は不合格扱い
  if (range.minYear != null && year < range.minYear) return false;
  if (range.maxYear != null && year > range.maxYear) return false;
  return true;
}

export function getSliderBand(id: SliderId, value: number): SliderBand {
  const def = sliders.find((s) => s.id === id)!;
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return def.bands.find((b) => v >= b.min && v <= b.max) ?? def.bands[2];
}

/** 卓の状態を、選曲AI用の条件テキストにまとめる（単一ソースからの導出） */
/** 審査パス用: カード条件と、端に振られたスライダー条件だけを抽出する。
    人気度は含めない（「知らない曲=不可」との組み合わせでデッドロックを起こすため）。
    年代はコードのゲートで検証済みのため含めない。 */
export function describeJudgeConditions(state: {
  cards: string[];
  sliders: Record<SliderId, number>;
}): string {
  const lines: string[] = [];

  for (const id of state.cards) {
    const c = getCard(id);
    if (c) lines.push(`- ${c.label}: ${c.promptText}`);
  }

  const heat = getSliderBand("heat", state.sliders?.heat ?? 50);
  if (heat.label === "クール" || heat.label === "ホット") {
    lines.push(`- 温度感（${heat.label}）: ${heat.promptText}`);
  }

  return lines.join("\n");
}

export function describeState(state: {
  cards: string[];
  sliders: Record<SliderId, number>;
}): string {
  const moodLines = state.cards
    .filter((id) => !isRegionCard(id))
    .map((id) => getCard(id))
    .filter((c): c is MoodCard => !!c)
    .map((c) => `- ${c.label}: ${c.promptText}`);

  const regionLines = state.cards
    .filter((id) => isRegionCard(id))
    .map((id) => getCard(id))
    .filter((c): c is MoodCard => !!c)
    .map((c) => `- ${c.label}: ${c.promptText}`);

  const sliderLines = sliders.map((def) => {
    const band = getSliderBand(def.id, state.sliders[def.id] ?? def.defaultValue);
    return `- ${def.label}（${band.label}）: ${band.promptText}`;
  });

  const sections = [
    moodLines.length
      ? `【雰囲気カード】\n${moodLines.join("\n")}`
      : "【雰囲気カード】\n- 指定なし（自由に選んでよい）",
  ];

  if (regionLines.length) {
    sections.push(
      `【ことば・地域（最優先・必ず守る）】\n${regionLines.join("\n")}\n- 複数指定時は交互に、または自然に行き来してよいが、指定外の地域は選ばない`,
    );
  }

  sections.push(`【調整スライダー】\n${sliderLines.join("\n")}`);
  return sections.join("\n\n");
}
