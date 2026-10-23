# T7: 特集番組モード（カトパコの音楽地図）

Status: in-progress (2026-10-23)
Branch: `feature/curated-radio-program`

## 目的
既存の「終わらないAI選曲ラジオ」は一切置き換えず、曲順とトークが編集済みの**特集番組**を選んで聴けるようにする。最初のコンテンツは「カトパコの音楽地図」。リスナーがまずCA7RIEL & Paco Amorosoの「DUMBAI」を聴き、アルゼンチンのシーン、本人が言及する音楽、現代ポップとの比較を経て、カトパコへ戻る。全14曲の原案を維持する。

## 正の設計原則
`PROJECT.md` の未知との遭遇、無音にしない、実再生、履歴からの好み学習禁止は**通常放送**にそのまま適用する。特集はリスナーが明示的に選択したときに限る。特集用に通常のカード/フェーダーやAI選曲を変更しない。

## 曲順（曲名は仮確定、Spotifyの正確なURI/バージョンは未照合）
1. CA7RIEL & Paco Amoroso — DUMBAI
2. Sumo — La Rubia Tarada
3. Virus — Wadu Wadu
4. Charly García — Nos Siguen Pegando Abajo
5. Pantera — Mouth for War
6. Megadeth — Holy Wars... The Punishment Due
7. CA7RIEL & Paco Amoroso — #TETAS
8. Yes — Close to the Edge
9. Kendrick Lamar — Wesley's Theory
10. WOS — CANGURO
11. Louis Cole — F it Up
12. Charli xcx — 360
13. Hearts2Hearts — RUDE!
14. CA7RIEL & Paco Amoroso — EL DÍA DEL AMIGO

**重要**: アーティスト本人の言及を裏付けられた「影響・嗜好」と、DJによる「音楽的な類似の聴き比べ」を `relationKind` で別管理。実際の発言は引用原文・出典URL・翻訳を別フィールドとして保持し、引用の捏造を防ぐ。放送台本・出典の確認済みテキストを入力するまでは番組を公開しない。

## データ形式（案）
`src/programs/types.ts` に以下の概念を定義する。

```ts
type ProgramTrack = {
  title: string;
  artist: string;
  spotifyUri: string;  // spotify:track:...。Spotify検索結果で検証済み
  versionNote?: string; // studio/liveなど
};
type ProgramSegment = {
  id: string;
  track: ProgramTrack;
  preTalk: string;       // 曲前DJトーク。放送順で読む
  postTalk?: string;     // 必要な場合のみ曲後（次のpreTalkと重複させない）
  relationKind: "artist-stated" | "same-scene" | "critical-comparison" | "subject-track";
  citations: Array<{url: string; quotedOriginal?: string; translated?: string; note?: string}>;
};
type CuratedProgram = {
  id: string;
  title: string;
  summary: string;
  openingTalk?: string;  // 「DUMBAI」を冒頭でいきなり鳴らす構成なら空
  closingTalk?: string;
  segments: ProgramSegment[];
};
```

## 段階的実装
1. **資料確認**: 解説充実版の原稿をリポジトリへテキスト移植。発言の出典、楽曲表記、各アーティストの説明をファクトチェック。番組内で使う台本は自然な話し言葉の完成原稿（キーワードだけの生成依頼にしない）。
2. **Spotify同定**: 14曲のURIを厳密照合。アーティスト、曲、スタジオ/ライブ等の版を確認。存在しない・地域で再生不可なら代替候補を明示し無断変更しない。
3. **TTS長文対応**: `/api/tts` は現状 `text.slice(0, 400)` のため長い原稿が欠落する。意味的な文章単位で短いチャンクに分割して順次音声化する（またはセグメント単位で分割）。最大長・コスト・失敗時のブラウザTTSフォールバック・二重読み防止を実装し、全文読み上げをテスト。
4. **分離したプレーヤー制御**: 特集のキューは確定データから供給。通常の `/api/queue/fill` には流さない。既存SDKの認証、再生、曲末ポーリングを共通化する場合は既存動作を回帰テスト。特集ではランダムな時報・ジングルを原則抑止（台本で指定した演出だけ再生）。
5. **UI**: 通常の放送開始の隣に「特集番組」を用意し、番組タイトル、概要、曲順、ソースを表示。ユーザー操作で開始。特集終了後は終了画面で停止し、通常放送へ移動する明示操作を提供。無断でAI放送へ流さない。
6. **操作とログ**: 曲途中の一時停止/再開、次曲送り、ナレーション中スキップ、音声モードoff/browser/hqを確認。評価◎○✕はカード適合なので特集には出さないか別スキーマにする。通常放送のログ/統計に特集を混ぜない。
7. **検証**: `npm run typecheck`、`npm run build`。Spotify Premiumアカウントで開始→14曲→終了、ナレーション全文、音声重複なし、曲末移行、曲スキップ、一時停止、地域での再生可否、通常放送に戻った後の10曲連続再生を確認。本番はユーザーの音質/声の承認後に反映。

## 既存コードの位置
- `src/engine/useRadioEngine.ts`: SDK初期化・プレイ状態・曲末検出(700ms)、通常のAIキュー、短文TTS
- `src/app/page.tsx`: 現在の唯一のラジオUI
- `src/app/api/tts/route.ts`: 400文字でトリミング（長文改修の必須箇所）
- `src/logs/schema.ts`: QueueItem。特集の評価を既存のカード評価に混ぜない
- `PROJECT.md`, `AGENTS.md`, `HANDOFF.md`: 原則と保護対象

## この段階での状態
設計メモ作成済み。再生エンジンや本番の振る舞いは未変更。SpotifyのトラックURIおよび放送原稿の本文はまだ取り込み・検証前。実装できたと表現しないこと。
