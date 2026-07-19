// src/pipeline/core.ts — 選曲パイプライン
// buildPolicy: 卓の状態 → 選曲方針（stateVersionごとに1回だけ呼ぶ想定）
// generateCandidates: 方針＋直前曲＋除外リスト → 候補曲（少量）
// resolveTrack: Spotify検索で実在解決。アーティスト不一致は棄却
// buildNarration: 前曲→次曲のつなぎコメント（1〜2文）

import { callJson } from "@/server/openai";
import { describeState, regionMatches, type SliderId } from "@/pipeline/definitions";

// 生成プロンプトのバージョンタグ（変更8: 効果測定のためログに残す）
export const PROMPT_VERSION = "v9-self-judge";

export type StationState = {
  version: number;
  cards: string[];
  sliders: Record<SliderId, number>;
};

export type Policy = {
  stateVersion: number;
  directive: string; // 選曲方針（自然文）
};

export type Candidate = {
  title: string;
  artist: string;
  why: string;
  expectedYear?: number | null; // 選曲AIが想定する原曲のリリース年（変更7b: 年ズレ検知用）
};

export type ResolvedTrack = {
  uri: string;
  title: string; // Spotify上の正式名
  artist: string; // 主アーティスト
  artists: string[];
  durationMs: number;
  year: number | null;
  album: string | null;
  reissue: boolean; // リマスター等の再発盤マーカーあり（年が原盤年でない可能性）
  artistExact: boolean;
  titleExact: boolean;
};

// ---- 方針生成 ----

export async function buildPolicy(state: StationState): Promise<Policy> {
  const stateText = describeState(state);

  const out = await callJson<{ directive: string }>({
    system:
      "あなたは連続ラジオの選曲家です。リスナーの卓の状態（雰囲気カードとスライダー）を読み、" +
      "これからの選曲方針を日本語で簡潔にまとめます。出力はJSONのみ: " +
      '{"directive": "選曲方針を3〜5文で。音楽的な質感・年代・人気度・冒険度の扱いを具体的に。ことば・地域の指定があれば、それを最優先の条件として方針の冒頭に明記する"}',
    user: stateText,
    temperature: 0.6,
  });

  return { stateVersion: state.version, directive: out.directive };
}

// ---- 候補生成（自己判定を内蔵） ----
// かつては生成→別役の審査パス(LLM)の2段構成だったが、審査を厳しくしすぎて
// 「知ってる曲=定番でNG、知らない曲=不明でNG」のデッドロックを起こした教訓（PROJECT.md §6）と、
// 審査の却下回数と人間評価が無相関だった実測（judgeがカード適合ではなく形式条件しか見ていなかった）から、
// 別役の審査パスは廃止。同一コール内で「候補を挙げる→各カードに照らして自己判定する→
// 最も確からしいものだけ残す」まで完結させる（追加レイテンシはトークン分のみ）。

export type GenerateCandidatesResult = {
  passed: Candidate[]; // 自己判定を通過した候補（確信度の高い順、最大3件）
  rejected: { title: string; artist: string; reason: string }[]; // 自己判定で落ちた候補（ログ用。変更8）
};

export async function generateCandidates(params: {
  policy: Policy;
  stateText: string; // describeState()の生テキスト（カード・スライダー条件の厳守用。カード排他は上位で確定済み）
  lastTrack: { title: string; artist: string } | null;
  count: number; // 自己判定にかける前に頭の中で挙げる候補数の目安
  driftNote?: string | null; // 言語・地域の吸着を崩すための追加指示
}): Promise<GenerateCandidatesResult> {
  const { policy, stateText, lastTrack, count, driftNote } = params;

  // 設計メモ: かつては「最近流れた曲」20件をプロンプトに入れていたが、
  // 長いセッションでこのリストが強力な実例集として働き、方針・カードより
  // 直近の傾向（言語圏など）を模倣させてしまうことが判明した。
  // 重複排除はサーバ側（fill route）でコード的に行い、プロンプトには入れない。

  const lastText = lastTrack
    ? `${lastTrack.title} / ${lastTrack.artist}`
    : "（アンカーなし。選曲条件の中心から自由に選ぶ）";

  const out = await callJson<{
    passed: Candidate[];
    rejected: { title: string; artist: string; reason: string }[];
  }>({
    system:
      "あなたはラジオDJとして次の曲を選ぶ。実在する楽曲のみを挙げること。曲名とアーティスト名の組み合わせが正確であることが最重要。" +
      "自信のない組み合わせを出すくらいなら、確実に実在する別の曲を選ぶこと。" +
      "\n\n【選曲の原則】" +
      "\n1. 雰囲気カードは「情景・感情」の指定であり、ジャンルの指定ではない。条件を満たすなら、どのジャンル・国・年代からでも選んでよい。定義文の例示はジャンルの範囲ではなく、軸がジャンルを横断することを示す見本である。" +
      "\n2. 条件が両立しないときは【条件が両立しないとき】の優先順位に従う。" +
      "\n3. 直近の流れと同じアーティスト・同じ質感が続いたら、条件の範囲内で意図的に離れた場所から選ぶ。" +
      "\n4. 「前の曲からの接続」とは質感・温度・リズム・時代の空気のつながりのことであり、言語や国籍を引き継ぐことではない。" +
      "\n5. 曲名や歌詞にカードの単語が入っているという理由だけで選ばないこと（例:「ドライブ」でタイトルにdrive/road/rideを含む曲を集める、「雨」でrainを含む曲を集める等）。" +
      "\n6. 地域・言語カードの適合判定に、影響力・知名度・活動拠点などの理由による例外を一切認めない。「ドイツのアーティストだが影響力が高いため」のような正当化は禁止。指定された地域に実際に属するアーティストの曲以外は、理由を問わず不合格とする。" +
      "\n\n【判定の較正例】" +
      "\n「静かな曲」と「夜更けの曲」は別物である。風をあつめて（はっぴいえんど）は静かだが昼の情景であり midnight に不適。ブルー・ライト・ヨコハマは静かではないが夜の情景であり適合。判定は音の静かさではなく情景で行う。" +
      "\n\n【手順】" +
      `\nまず頭の中で候補を${count}曲挙げる。次に各候補を、提示されている雰囲気カード・地域カードの一枚ずつすべてに照らして自己判定する——その曲が実際に持つ情景・性格に基づいて判断する。地域・言語カードが指定されている場合、各候補のwhy/reasonに必ず「国籍/活動拠点: ○○」という記載を含めること(省略不可。この記載がない場合、コード側の検証で機械的に不合格として扱われる)。指定地域と一致しない場合は理由を問わず(知名度・影響力・音楽的つながりの深さを含め)不合格とする。全カードを満たす曲だけを合格とする。「合うと言えなくもない」程度の曲は不合格にする。よく知らない曲は、不合格にせず理由に「推測」と明記して合格にしてよい（無名曲は発見の源泉のため排除しない）。合格の中から実在の確実性が高い順に最大3件を出力し、不合格は自己判定で落ちたものをすべて理由つきで出力する。` +
      '出力はJSONのみ: {"passed": [{"title": "曲名（原語表記）", "artist": "アーティスト名（原語表記）", "why": "実際の特徴に基づく合格理由(地域・言語カード指定時は「国籍/活動拠点: ○○」の形式で必ず明記する)", "expectedYear": 原曲のリリース年（西暦の数値、わからなければnull）}], "rejected": [{"title": "曲名", "artist": "アーティスト名", "reason": "不合格にした理由(地域・言語カード指定時は「国籍/活動拠点: ○○」の形式で必ず明記する)"}]}' +
      "候補同士は別のアーティストにすること。",
    user: [
      `【選曲条件（現在の卓の状態・厳守）】\n${stateText}`,
      `【選曲方針】\n${policy.directive}`,
      `【直前に流れた曲】\n${lastText}`,
      ...(driftNote ? [`【注意】${driftNote}`] : []),
      "現在の選曲条件を最優先に、次の曲を選んでください。",
    ].join("\n\n"),
    temperature: 0.9,
  });

  return {
    passed: Array.isArray(out.passed) ? out.passed.slice(0, 3) : [],
    rejected: Array.isArray(out.rejected) ? out.rejected : [],
  };
}

// 変更12改訂: プロンプト文言の強化だけでは自己判定の不一致（却下段階では国籍を正しく
// 判定しているのに、最終選出でThe Strokes＝アメリカのような他国アーティストが紛れ込む）
// を防げなかった実運用結果を受け、candidateWhyから「国籍/活動拠点: ○○」を機械的に
// 抽出し、地域カードと一致するかコード側でハード検証する（fill route側でpassed候補に適用）。
const REGION_DECLARATION_RE = /国籍\/活動拠点[:：]\s*(.+?)(?:[。.\n]|$)/;

// 実運用で判明したバグ（2026-07-19、Travis Scottの実例）: 「国籍/活動拠点: アメリカだが、
// イギリスで数回パフォーマンスを行っており…」のように、正しい国籍を断言した直後に対象地域名を
// 含む正当化（変更9-11で禁止したはずの"影響力"型の言い訳）が続くと、regionMatchesの単純な
// 部分文字列一致がその正当化部分にヒットしてしまい、誤って合格判定になっていた。
// 宣言文を逆接語で分割し、最初に断言した部分だけを判定に使うことで、後続の言い訳を無視する。
const HEDGE_SPLIT_RE = /だが|けど|しかし|ただし|もっとも/;

/** candidateのwhy(またはreasonなどの自己判定テキスト)に含まれる国籍/活動拠点宣言を
    抽出し、指定地域カードと一致するか検証する。記載自体がなければ不合格。
    逆接語以降（言い訳・正当化）は判定に使わず、最初に断言した部分だけを見る。 */
export function verifyRegionDeclaration(candidateText: string, regionCardId: string): boolean {
  const match = String(candidateText ?? "").match(REGION_DECLARATION_RE);
  if (!match) return false; // 記載なし→不合格(省略不可の指示に従っていない)
  const primary = match[1].split(HEDGE_SPLIT_RE)[0];
  return regionMatches(primary, regionCardId);
}

// 変更14: 変更12改訂だけでは「候補の却下段階では正確な国籍を判定できるのに、
// 選出候補になったアーティストにだけ虚偽の国籍を自己申告する」系統的な誤りを防げないと
// 実運用で判明した（2000年代ガレージロック/インディーリバイバルという同一ジャンルに属する
// The Killers/Sir Sly/The Strokes/The White Stripes=いずれもアメリカが「イギリス」と
// 誤申告され、7セグメント中4件で選出された）。モデルの自己申告より優先して機械的に
// 上書きする軽量な補正リストで対抗する。網羅的なデータベースは意図的に作らず、
// 実運用で誤認が確認されたアーティストのみ都度追加する運用とする。
const KNOWN_ARTIST_NATIONALITY_OVERRIDES: Record<string, string> = {
  "the killers": "usa",
  "sir sly": "usa",
  "the strokes": "usa",
  "the white stripes": "usa",
  // 2026-07-19追加(変更15-3): uk + grit + texture=100の実運用テストで、逆接語を使わず
  // 最初から堂々と「国籍/活動拠点: イギリス」と虚偽申告し選出された（変更15-2の対象外パターン）
  "moses sumney": "usa",
};

/** モデルの自己申告より優先すべき、既知の国籍補正値を返す（未登録なら null） */
export function getArtistNationalityOverride(artist: string): string | null {
  return KNOWN_ARTIST_NATIONALITY_OVERRIDES[normalizeName(artist)] ?? null;
}

// ---- Spotify解決 ----

export function normalizeName(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/\s*[\(\[\-–—].*$/, "") // 括弧書き・ダッシュ以降（remaster表記等）を落とす
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// 変更7a: カラオケ/インスト/ライブ/リミックス等は原曲ではないため解決結果から弾く（ハード除外）。
// 実績: 「青い山脈 - オリジナル・カラオケ」がjudge通過してbadになった
// （normalizeNameがダッシュ以降を落とすため、この手のタイトルはtitleExact判定をすり抜けてしまう）。
// 実績2(2026-07-19、変更15-4): 「Fools Gold - Grooverider's Mix」のような、remixという単語を
// 使わない別バージョン表記（リミキサー名の所有格 + Mix）がすり抜けてbadになった。
// 裸の"mix"は追加しない（"Mixed Emotions"のような実在曲名や、ダンス曲の原曲を示す
// 正規のタグ"Original Mix"まで誤って弾いてしまうため）。実際に問題になった
// パターン（所有格+Mix、および業界で確立された別バージョン系の複合語）だけを狙い撃ちする。
const VERSION_MARKERS =
  /remix|live|edit|acoustic|instrumental|karaoke|demo|sped up|slowed|cover|version|take\s*\d+|outtake|alternate|anthology|rehearsal|['’]s\s+mix|radio\s+mix|club\s+mix|extended\s+mix|dub\s+mix|カラオケ|インストゥルメンタル|インスト|ライブ|ライヴ|リミックス/i;
const REISSUE_MARKERS = /remaster|reissue|anniversary|deluxe|expanded/i;

/** バージョン選択スコア（小さいほど良い）。原曲を優先する。
    yearGap: 選曲AIが想定した年との差（変更7b）。大きくずれる盤は下げる（別盤の原盤があれば優先）。 */
export function scoreTrackVersion(
  rawTitle: string,
  albumName: string,
  titleExact: boolean,
  yearGap: number | null = null,
): number {
  let score = 0;
  if (REISSUE_MARKERS.test(rawTitle) || REISSUE_MARKERS.test(albumName)) score += 1;
  if (!titleExact) score += 0.5;
  if (yearGap != null && yearGap > 10) score += 3;
  return score;
}

export async function resolveTrack(
  candidate: Candidate,
  accessToken: string,
): Promise<ResolvedTrack | null> {
  const queries = [
    `track:"${candidate.title}" artist:"${candidate.artist}"`,
    `${candidate.title} ${candidate.artist}`,
  ];

  type Scored = { track: ResolvedTrack; score: number };
  const matches = new Map<string, Scored>();

  for (const q of queries) {
    const url =
      "https://api.spotify.com/v1/search?type=track&limit=8&q=" +
      encodeURIComponent(q);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 429) return null; // レート制限: このfillは諦める
    if (!res.ok) continue;

    const data = await res.json();
    const items: any[] = data?.tracks?.items ?? [];

    for (const t of items) {
      if (!t?.uri || matches.has(t.uri)) continue;
      const artists: string[] = (t?.artists ?? []).map((a: any) => String(a?.name ?? ""));
      const artistExact = artists.some(
        (a) => normalizeName(a) === normalizeName(candidate.artist),
      );
      // アーティスト不一致は誤解決とみなし棄却（品質の生命線・不変）
      if (!artistExact) continue;

      const rawTitle = String(t?.name ?? "");
      // 変更7a: カラオケ/インスト/ライブ/リミックス等は原曲ではないため弾く（別バージョンを探し直す）
      if (VERSION_MARKERS.test(rawTitle)) continue;

      const albumName = String(t?.album?.name ?? "");
      const titleExact = normalizeName(rawTitle) === normalizeName(candidate.title);
      const reissue = REISSUE_MARKERS.test(rawTitle) || REISSUE_MARKERS.test(albumName);
      const year = t?.album?.release_date
        ? Number(String(t.album.release_date).slice(0, 4)) || null
        : null;
      // 変更7b: 選曲AIが想定した年と大きくずれる盤（別作品への誤解決の疑い）は下げる
      const yearGap =
        candidate.expectedYear != null && year != null
          ? Math.abs(year - candidate.expectedYear)
          : null;

      matches.set(t.uri, {
        score: scoreTrackVersion(rawTitle, albumName, titleExact, yearGap),
        track: {
          uri: t.uri,
          title: rawTitle,
          artist: artists[0] ?? candidate.artist,
          artists,
          durationMs: t.duration_ms ?? 0,
          year,
          album: albumName || null,
          reissue,
          artistExact,
          titleExact,
        },
      });
    }

    // バージョン文字列を含む結果はここまでで既に除外済みのため、
    // 1本目のクエリで何か1件でも取れていれば「原曲と呼べるもの」であり、2本目は撃たない
    if (matches.size > 0) break;
  }

  if (matches.size === 0) return null;
  return [...matches.values()].sort((a, b) => a.score - b.score)[0].track;
}

// ---- ナレーション生成 ----

export async function buildNarration(params: {
  next: { title: string; artist: string; year: number | null; album: string | null };
}): Promise<string> {
  const { next } = params;

  const out = await callJson<{ narration: string }>({
    system:
      "あなたは音楽番組の進行役です。次にかける曲の、短い紹介コメントを作ります。" +
      "スタイル: 事実に基づいた解説。ライナーノーツの冒頭のような、簡潔で信頼できる語り口。" +
      "ルール:" +
      "・1〜2文、80〜130字。落ち着いた話し言葉。" +
      "・次の曲のアーティスト名と曲名を必ず含める。" +
      "・与えられた年・アルバム名は使ってよい。加えて、あなたが確実に知っている一般的な事実（アーティストの出身国・地域、ジャンル、活動時期、その曲の音楽的特徴）は使ってよい。" +
      "・少しでも不確かな情報（チャート成績、売上、受賞、制作秘話、タイアップ）は一切入れない。確信のあることだけを話す。" +
      "・前にかかった曲への言及は禁止。選曲の流れ・つながり・雰囲気の変化についての説明も禁止。" +
      "・選曲条件（カードやスライダー）にどう合っているかの説明も禁止。" +
      "・リスナーへの呼びかけ（「おたのしみに」「お聴きください」等）や挨拶・番組名は禁止。" +
      "・文型を毎回変える。「〇〇出身のバンド△△による「X」は、〇年にリリースされたアルバム『Y』収録」のような定型の繰り返しは禁止。年やアルバム名から入っても、音の描写から入ってもよい。" +
      '出力はJSONのみ: {"narration": "コメント本文"}',
    user:
      `次の曲: ${next.title} / ${next.artist}` +
      `${next.year ? ` ・ ${next.year}年` : ""}` +
      `${next.album ? ` ・ アルバム「${next.album}」収録` : ""}`,
    temperature: 0.7,
  });

  return (
    String(out.narration ?? "").trim() ||
    `${next.artist}、${next.year ? next.year + "年の" : ""}「${next.title}」。`
  );
}
