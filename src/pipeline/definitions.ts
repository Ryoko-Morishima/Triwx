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

// 性格カード（時間・シーン・雰囲気）: 選択上限 MAX_PERSONALITY_CARDS（互いに椅子取りゲームをする軸）。
// 変更9(tasks/triwx-revision-spec.md)で20→13枚に棚卸し。削除したカードの情景・感情は
// 無選択（自由に選んでよい）か、heat/textureスライダー、または近縁カードに吸収される設計。
export const moodCards: MoodCard[] = [
  // ---- 時間・天気 ----
  { id: "morning", group: "time", label: "朝", promptText: "朝の情景を持つ曲。目覚め、朝の光、始まり、出かける前の時間——世界観が「朝」または「一日の始まり」を描いていること。夜の情景・深夜の空気を持つ曲は、音が軽やかでも不可。重厚・壮大すぎる曲は朝に合わない。" },
  { id: "midnight", group: "time", label: "夜更け", promptText: "夜更けの情景を持つ曲。夜の街、ネオン、月、終電後、ひとりの部屋、バーの片隅——歌詞・タイトル・曲の世界観が「夜」を描いていることが第一条件。アレンジの静かさは条件ではない。静かでも昼や野外の情景の曲（牧歌的フォーク、青春讃歌、朝の歌）は不可。夜の情景があれば、音数が多い曲やグルーヴのある曲でもよい。" },
  { id: "rain", group: "time", label: "雨", promptText: "雨の日の質感。しっとりした音像、内省、窓の外を眺めるような距離感。" },
  { id: "summer", group: "time", label: "夏", promptText: "夏の情景。強い日差し、暑さ、開放感——都会のアスファルトの熱気でも、波打ち際の解放感でも、蝉と花火の湿った夏でも、季節としての夏を描いていればよい。国やジャンルを問わず、“夏”という季節感を持つ曲。" },
  // ---- シーン ----
  { id: "drive", group: "scene", label: "ドライブ", promptText: "走行感のあるグルーヴ。一定のリズム、前に進む推進力、風景が流れる感じ。" },
  { id: "focus", group: "scene", label: "作業・集中", promptText: "集中を妨げない曲。歌が主張しすぎない、または器楽中心。一定の質感が続く。" },
  // ---- 気分・質感 ----
  { id: "dance", group: "mood", label: "踊れる", promptText: "ビートで体を動かさせる曲。ダンスミュージック、ファンク、ディスコ、ハウス、アフロビート、ダンサブルなポップ/R&Bなど。テンポが速いだけのロックや、ビートの弱いギターポップは不可。" },
  { id: "doze", group: "mood", label: "まどろみ", promptText: "眠りに落ちる手前の心地よさ。アンビエント寄り、柔らかい輪郭、急な展開がない曲。" },
  { id: "grit", group: "mood", label: "ざらつき", promptText: "ざらついた質感。歪んだギター、荒い録音、生々しいエネルギー。歪みがなくても、録音の生々しさや非ポップスな手触り（ローファイ、ガレージ的なラフさ、オルタナのカバー等）があれば適合。クリーンに整音された美しいフォークロックの名曲（例: Harvest Moon的なもの）は、名曲でも不適合。ジャンルの指定ではなく質感の軸であり、ブルースの生々しさ、初期ヒップホップの粗さ、メタルの轟音など、ジャンルを横断する。" },
  { id: "experimental", group: "mood", label: "実験的", promptText: "定型から外れる面白さ。変わった構成・音色・リズム。ただし聴きやすさは完全には捨てない。" },
  { id: "bittersweet", group: "mood", label: "切なさ", promptText: "甘さと痛みが同居する感情。マイナーとメジャーの揺らぎ、郷愁を誘うメロディ。夕暮れのような、昼と夜の境目の感傷も含む。" },
  { id: "nostalgia", group: "mood", label: "ノスタルジー", promptText: "懐かしさ。録音の質感やアレンジに時代の匂いがある曲。世代の記憶に触れる感じ。" },
  { id: "uplift", group: "mood", label: "高揚", promptText: "気分が上がっていく感じ。開放感のあるコーラスやビルドアップ、ただし騒がしすぎない。" },
];

// ---- ことば・地域カード ----
// 西洋音楽への偏りを崩すための独立カテゴリ。選択時は「厳守条件」として選曲AIに渡す。
// 性格カードとは異なり組み合わせの妙味が薄い単なるフィルタのため、選択上限は MAX_REGION_CARDS(=1枚)。
// 変更9(tasks/triwx-revision-spec.md)で7→12枚に拡充。

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
      "日本・韓国以外の東・東南アジア圏（台湾、香港、タイ、インドネシア、フィリピン、ベトナムなど）のアーティストの曲だけを選ぶ。",
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
      "英語圏（イギリスを除く）以外のヨーロッパ（フランス、ドイツ、イタリア、北欧、東欧など）のアーティストの、主に現地語で歌われる曲だけを選ぶ。",
  },
  {
    id: "world_trip",
    label: "世界を旅する",
    promptText:
      "毎回ちがう意外な国のアーティストから選ぶ。英語圏と日本の有名曲は避ける。まだ流れていない国を優先し、その国ならではの音を持つ曲を選ぶ。",
  },
  {
    id: "india",
    label: "インド",
    promptText:
      "インドのアーティストの曲だけを選ぶ。ボリウッド、インド古典（ヒンドゥスターニー/カルナータカ）、現代インディー、バングラ、スーフィー音楽まで幅広く。",
  },
  {
    id: "middle_east",
    label: "中東",
    promptText:
      "中東（アラビア語圏、ペルシャ語圏、トルコ、イスラエルなど）のアーティストの曲だけを選ぶ。伝統的なマカーム音楽から現代のインディー・ポップまで。",
  },
  {
    id: "caribbean",
    label: "カリブ海",
    promptText:
      "カリブ海地域（ジャマイカ、トリニダード、ハイチなど英語・フランス語圏）のアーティストの曲だけを選ぶ。レゲエ、ダンスホール、ソカ、カリプソ、ズークなど。",
  },
  {
    id: "uk",
    label: "イギリス",
    promptText:
      "イギリスのアーティストの曲だけを選ぶ。ブリットポップ、UKガラージ、グライム、北部ソウル、フォークリバイバルなど、島国ならではの内向きな進化を持つ音楽。",
  },
  {
    id: "usa",
    label: "アメリカ",
    promptText:
      "アメリカのアーティストの曲だけを選ぶ。ソウル、ヒップホップ、カントリー、ブルース、インディーロックなど地域ごとに枝分かれした大陸規模の音楽伝統。",
  },
];

export function getCard(id: string): MoodCard | undefined {
  return moodCards.find((c) => c.id === id) ?? regionCards.find((c) => c.id === id);
}

export function isRegionCard(id: string): boolean {
  return regionCards.some((c) => c.id === id);
}

// ---- 地域宣言のコード側ハード検証（変更12改訂） ----
// generateCandidatesが返すwhy/reasonの「国籍/活動拠点: ○○」を機械的に照合するための
// 簡易な文字列許可（or 除外）リスト。厳密な国籍データベースは意図的に使わない
// （tasks/triwx-revision-spec.md 変更12「既知の限界」参照）。

type RegionMatchRule = { type: "allow"; terms: string[] } | { type: "deny"; terms: string[] };

export const regionMatchRules: Record<string, RegionMatchRule> = {
  lang_ja: { type: "allow", terms: ["日本", "japan"] },
  kr: { type: "allow", terms: ["韓国", "korea"] },
  asia: {
    type: "allow",
    terms: [
      "台湾", "香港", "タイ", "インドネシア", "フィリピン", "ベトナム", "マレーシア", "シンガポール", "中国", "モンゴル", "ミャンマー", "カンボジア", "ラオス",
      "taiwan", "hong kong", "thailand", "indonesia", "philippines", "vietnam", "malaysia", "singapore", "china", "mongolia",
    ],
  },
  latin: {
    type: "allow",
    terms: [
      "メキシコ", "ブラジル", "アルゼンチン", "コロンビア", "チリ", "ペルー", "ベネズエラ", "キューバ", "ドミニカ", "ウルグアイ", "スペイン", "ポルトガル",
      "mexico", "brazil", "argentina", "colombia", "chile", "peru", "venezuela", "cuba", "dominican", "uruguay", "spain", "portugal",
    ],
  },
  africa: {
    type: "allow",
    terms: [
      "ナイジェリア", "南アフリカ", "ケニア", "ガーナ", "エチオピア", "セネガル", "マリ", "アンゴラ", "エジプト", "モロッコ", "コンゴ",
      "nigeria", "south africa", "kenya", "ghana", "ethiopia", "senegal", "mali", "angola", "egypt", "morocco", "congo",
    ],
  },
  europe: {
    type: "allow",
    terms: [
      "フランス", "ドイツ", "イタリア", "オランダ", "ベルギー", "スイス", "オーストリア", "スペイン", "ポルトガル", "スウェーデン", "ノルウェー", "デンマーク", "フィンランド", "アイスランド", "ポーランド", "チェコ", "ハンガリー", "ルーマニア", "ギリシャ", "ロシア", "ウクライナ",
      "france", "germany", "italy", "netherlands", "belgium", "switzerland", "austria", "spain", "portugal", "sweden", "norway", "denmark", "finland", "iceland", "poland", "czech", "hungary", "romania", "greece", "russia", "ukraine",
    ],
  },
  // world_trip: 「英語圏と日本の有名曲は避ける」という除外条件のため許可リストではなく除外リストにする
  world_trip: {
    type: "deny",
    terms: ["アメリカ", "イギリス", "オーストラリア", "カナダ", "日本", "america", "usa", "uk", "britain", "australia", "canada", "japan"],
  },
  india: { type: "allow", terms: ["インド", "india"] },
  middle_east: {
    type: "allow",
    terms: [
      "トルコ", "イラン", "イスラエル", "サウジ", "アラブ", "レバノン", "エジプト", "シリア", "イラク", "ヨルダン",
      "turkey", "iran", "israel", "saudi", "lebanon", "egypt", "syria", "iraq", "jordan",
    ],
  },
  caribbean: {
    type: "allow",
    terms: [
      "ジャマイカ", "トリニダード", "ハイチ", "バハマ", "キューバ", "プエルトリコ", "バルバドス",
      "jamaica", "trinidad", "haiti", "bahamas", "cuba", "puerto rico", "barbados",
    ],
  },
  uk: {
    type: "allow",
    terms: [
      "イギリス", "英国", "スコットランド", "イングランド", "ウェールズ", "北アイルランド",
      "uk", "united kingdom", "britain", "british", "england", "scotland", "wales",
    ],
  },
  usa: { type: "allow", terms: ["アメリカ", "米国", "usa", "united states", "america"] },
};

/** 宣言された国籍/活動拠点の文字列が、指定地域カードの許可(または除外)リストに合致するか */
export function regionMatches(declared: string, regionCardId: string): boolean {
  const rule = regionMatchRules[regionCardId];
  if (!rule) return true; // ルール未定義の地域カード（将来追加分）は検証をスキップする安全弁
  const norm = declared.toLowerCase();
  const hit = rule.terms.some((t) => norm.includes(t.toLowerCase()));
  return rule.type === "allow" ? hit : !hit;
}

// ---- 選択上限・排他（単一ソース。UIの選択制御が参照する） ----

export const MAX_PERSONALITY_CARDS = 2; // 時間・シーン・雰囲気カードの合計
export const MAX_REGION_CARDS = 1; // ことば・地域カードの合計

// 性格カード内で物理的に両立しない組み合わせ（時間帯グループの排他は
// MAX_PERSONALITY_CARDS=2の上限で実質的に上位互換されるため廃止）
export const exclusionPairs: [string, string][] = [
  ["doze", "dance"],
  ["doze", "grit"],
  ["doze", "uplift"],
];

/** idを選んだときに自動で外すべき、選択済みカードのidを返す */
export function conflictsWith(id: string, selected: string[]): string[] {
  const out = new Set<string>();
  for (const [a, b] of exclusionPairs) {
    if (a === id && selected.includes(b)) out.add(b);
    if (b === id && selected.includes(a)) out.add(a);
  }
  return [...out];
}

// ---- comboHints（化学反応する組み合わせの追加解釈） ----
// 網羅しない。LLMの自然解釈が外しそうな組だけ少数登録する。

export const comboHints: { cards: string[]; promptText: string }[] = [
  {
    cards: ["midnight", "dance"],
    promptText:
      "深夜のクラブ・フロアの時間帯。ディープハウス、テクノ、夜が深まるほど効くグルーヴ。昼のパーティーチューンではなく、暗さと快楽が同居する曲。",
  },
  {
    cards: ["bittersweet", "dance"],
    promptText:
      "泣きながら踊る音楽。切なさと踊れるビートの同居（Robyn的な様式、本来のディスコが持っていた感情）。切ないミッドテンポに丸めない。",
  },
  {
    cards: ["rain", "dance"],
    promptText: "雨の都市のダンスミュージック。UKガラージ、ダブステップ、しっとりした質感とビートの共存。",
  },
  {
    cards: ["morning", "bittersweet"],
    promptText: "徹夜明けの朝、昨夜を引きずった朝。清潔な朝ではなく、カムダウンの時間。",
  },
];

// ---- スライダー ----

export type SliderId = "era" | "heat" | "popularity" | "texture";

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
      { min: 81, max: 100, label: "定番", promptText: "誰もが知る有名曲・代表曲を中心に選ぶ。ただし雰囲気カードとの適合が最優先。適合する定番曲が尽きたら、知名度を下げてでも雰囲気を守る。" },
    ],
  },
  {
    id: "texture",
    label: "質感",
    leftLabel: "アコースティック",
    rightLabel: "エレクトロニック",
    defaultValue: 50,
    bands: [
      { min: 0, max: 19, label: "アコースティック", promptText: "生楽器中心。ギター、ピアノ、弦、生ドラムなど、電子的な加工が最小限の音。シンセ・打ち込み・エレクトロニックプロダクションは不可。" },
      { min: 20, max: 39, label: "ややアコースティック", promptText: "生楽器を中心にしつつ、控えめな電子的処理を許容。" },
      { min: 40, max: 60, label: "指定なし", promptText: "質感は自由。" },
      { min: 61, max: 80, label: "ややエレクトロニック", promptText: "シンセや打ち込みを中心にしつつ、生楽器の要素も許容。" },
      { min: 81, max: 100, label: "エレクトロニック", promptText: "シンセ・打ち込み・電子的プロダクションが主体の曲。生楽器主体のアコースティックな演奏は不可。" },
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

const CONDITION_PRIORITY_SECTION = [
  "【条件が両立しないとき】",
  "- 優先順位は「ことば・地域 > 雰囲気カード > スライダー」。",
  "- 適合曲が見つからない場合、人気度→年代の順でスライダー条件を緩めてよい。雰囲気カードは緩めない。",
  "- 条件を緩めた場合は、選曲理由にどの条件を緩めたかを明記する。",
  "- 選曲理由には、その曲が実際に持つ特徴だけを書く。条件に合わない曲を合うと偽って正当化しない。",
].join("\n");

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
      `【ことば・地域（最優先・必ず守る）】\n${regionLines.join("\n")}\n` +
        "- 判定基準: 影響力・知名度・活動拠点などの理由による例外を一切認めない。「ドイツのアーティストだが影響力が高いため」のような正当化は禁止。指定された地域に実際に属するアーティストの曲以外は、理由を問わず不合格とする。",
    );
  }

  sections.push(`【調整スライダー】\n${sliderLines.join("\n")}`);

  const activeCombo = comboHints.filter((h) => h.cards.every((id) => state.cards.includes(id)));
  if (activeCombo.length) {
    sections.push(
      `【組み合わせの解釈】\n${activeCombo.map((h) => `- ${h.promptText}`).join("\n")}`,
    );
  }

  sections.push(CONDITION_PRIORITY_SECTION);

  return sections.join("\n\n");
}
