// src/pipeline/definitions.ts
//
// カード・スライダーの意味定義の【単一ソース】。
// UI表示・選曲プロンプト・（将来の）評価ゲートはすべてここを参照する。
// 「生成と評価で語彙が割れる」事故を初日から予防するための設計。

export type MoodCard = {
  id: string;
  label: string;
  promptText: string; // 選曲AIに渡す解釈文
};

export const moodCards: MoodCard[] = [
  // ---- 時間・天気 ----
  { id: "morning", label: "朝", promptText: "一日のはじまりの澄んだ空気。軽やかで清潔感のある音。重すぎない。" },
  { id: "afternoon", label: "昼下がり", promptText: "午後のゆるんだ時間。力の抜けたミッドテンポ、日だまりのような音色。" },
  { id: "dusk", label: "夕暮れ", promptText: "昼と夜の境目。オレンジ色の光のような、少し感傷的で美しい曲。" },
  { id: "midnight", label: "夜更け", promptText: "深夜の空気。音数が少なめ、残響、静けさの中の親密さ。BPMは控えめでよい。" },
  { id: "rain", label: "雨", promptText: "雨の日の質感。しっとりした音像、内省、窓の外を眺めるような距離感。" },
  { id: "sunny_holiday", label: "晴れた休日", promptText: "予定のない晴れた日の開放感。屋外の光を感じる、気持ちのいい曲。" },
  // ---- シーン ----
  { id: "drive", label: "ドライブ", promptText: "走行感のあるグルーヴ。一定のリズム、前に進む推進力、風景が流れる感じ。" },
  { id: "focus", label: "作業・集中", promptText: "集中を妨げない曲。歌が主張しすぎない、または器楽中心。一定の質感が続く。" },
  { id: "kitchen", label: "料理・家事", promptText: "手を動かしながら聴いて楽しい曲。軽快なリズム、鼻歌を誘うメロディ。" },
  { id: "gathering", label: "集い", promptText: "人が集まる場のBGM。会話を邪魔しない華やかさ、機嫌のいいグルーヴ。" },
  // ---- 気分・質感 ----
  { id: "dance", label: "踊れる", promptText: "体が動くダンサブルな曲。強いビートとグルーヴ。ジャンルは問わない。" },
  { id: "uplift", label: "高揚", promptText: "気分が上がっていく感じ。開放感のあるコーラスやビルドアップ、ただし騒がしすぎない。" },
  { id: "doze", label: "まどろみ", promptText: "眠りに落ちる手前の心地よさ。アンビエント寄り、柔らかい輪郭、急な展開がない曲。" },
  { id: "bittersweet", label: "切なさ", promptText: "甘さと痛みが同居する感情。マイナーとメジャーの揺らぎ、郷愁を誘うメロディ。" },
  { id: "romance", label: "ロマンチック", promptText: "甘く親密なムード。ソウル、スロージャム、美しいバラードやボサノバ。" },
  { id: "grit", label: "ざらつき", promptText: "歪んだギターや荒い録音の質感。ガレージ、パンク、オルタナ、生々しいエネルギー。" },
  { id: "nostalgia", label: "ノスタルジー", promptText: "懐かしさ。録音の質感やアレンジに時代の匂いがある曲。世代の記憶に触れる感じ。" },
  { id: "city", label: "都会", promptText: "都市の夜景や雑踏の洗練。シティポップ、ネオソウル、洒脱で少しクールな質感。" },
  { id: "nature", label: "自然", promptText: "屋外の開けた空気。アコースティックな手触り、土や光を感じるオーガニックな音。" },
  { id: "experimental", label: "実験的", promptText: "定型から外れる面白さ。変わった構成・音色・リズム。ただし聴きやすさは完全には捨てない。" },
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

export type SliderId = "era" | "heat" | "popularity" | "surprise";

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
      { min: 0, max: 19, label: "クール", promptText: "無機質・抑制的・都会的な距離感のあるサウンド。感情を抑えたボーカルや電子的質感を優先。" },
      { min: 20, max: 39, label: "ややクール", promptText: "落ち着きと洗練を感じる、やや温度低めのサウンド。" },
      { min: 40, max: 60, label: "指定なし", promptText: "温度感は自由。" },
      { min: 61, max: 80, label: "ややホット", promptText: "生命感や身体性を感じる、やや熱のあるサウンド。生楽器やソウルフルな歌唱を優先。" },
      { min: 81, max: 100, label: "ホット", promptText: "感情があふれ、汗や熱気を感じる曲。力強い歌唱、グルーヴの強い演奏。" },
    ],
  },
  {
    id: "popularity",
    label: "人気度",
    leftLabel: "深掘り",
    rightLabel: "定番",
    defaultValue: 50,
    bands: [
      { min: 0, max: 19, label: "深掘り", promptText: "有名アーティストの代表曲・超定番曲を避け、アルバム曲や知る人ぞ知る曲を優先する。" },
      { min: 20, max: 39, label: "やや深掘り", promptText: "大定番は少し避け、半歩掘った選曲にする。" },
      { min: 40, max: 60, label: "指定なし", promptText: "人気度は自由。" },
      { min: 61, max: 80, label: "やや定番", promptText: "広く知られた曲を中心に選ぶ。" },
      { min: 81, max: 100, label: "定番", promptText: "誰もが知る有名曲・代表曲を中心に選ぶ。" },
    ],
  },
  {
    id: "surprise",
    label: "意外性",
    leftLabel: "安定",
    rightLabel: "冒険",
    defaultValue: 30,
    bands: [
      { min: 0, max: 19, label: "安定", promptText: "流れを裏切らない、期待通りの選曲をする。" },
      { min: 20, max: 39, label: "やや安定", promptText: "基本は流れに沿いつつ、ときどき小さな変化をつける。" },
      { min: 40, max: 60, label: "中間", promptText: "半分は期待通り、半分は少し意外な角度から選ぶ。" },
      { min: 61, max: 80, label: "やや冒険", promptText: "ジャンルや地域を横断した、意外だが筋の通った選曲を混ぜる。" },
      { min: 81, max: 100, label: "冒険", promptText: "大胆に飛ぶ。異ジャンル・異文化圏・時代を跨ぐ選曲を積極的に行う。ただし前の曲との接続理由は必ず持つ。" },
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
