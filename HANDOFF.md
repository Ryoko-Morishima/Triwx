# HANDOFF.md — 引き継ぎ書（実装の現在地）

> 次の担い手（AIエージェント/人間）が最短で状況を掴むための文書。
> 最終更新: 2026-07-05（本番デプロイ直後）

## 0. 最初に読む順番

1. `PROJECT.md` — 目的・設計原則・教訓
2. `AGENTS.md` — 開発ルール・不変条件・危険領域
3. 本書 — ファイル地図と現在地
4. `ROADMAP.md` → 着手する `tasks/*.md`

## 1. 現在の実装状態（ひとことで）

**MVP完成・本番稼働中。** https://triwx.vercel.app で実再生・AI選曲・ナレーション・時報/ジングル・評価・ログ保存まで一通り動いている。大きな未実装は「散らし具合レポート」（tasks/T4）。

## 2. 主要ファイルと役割

```
src/
├─ app/
│  ├─ page.tsx                  # ラジオ画面（唯一のUI。木目ラジオ意匠）
│  ├─ about/page.tsx            # 「このラジオについて」
│  ├─ globals.css               # 全スタイル（デザイントークンは:rootの変数）
│  ├─ icon.svg / apple-icon.png # ファビコン
│  └─ api/
│     ├─ auth/login, auth/callback  # Spotify PKCE（verifierはCookie）
│     ├─ token/                     # SDK用アクセストークン払い出し（リフレッシュ込み）
│     ├─ queue/fill/                # ★心臓部: 1曲補充（下記§4）
│     ├─ queue/warm/                # 方針の事前ウォームアップ
│     ├─ tts/                       # OpenAI TTS（演出・高音質ナレーション用）
│     └─ log/                       # ログ追記(POST)/評価パッチ(PATCH)/閲覧(GET)
├─ engine/                      # クライアント側（ブラウザで動く）
│  ├─ useRadioEngine.ts         # ★状態機械: 再生/曲間/飢餓、残り時間監視、補充、
│  │                            #   局名コール（読み上げ設定から独立・キャッシュ・1.8倍増幅）
│  ├─ inserts.ts                # 時報・ジングルの判定（将来: ニュース/天気の拡張口）
│  ├─ sounds.ts                 # WebAudio合成音（共有AudioContext。unlockAudio必須）
│  └─ tts.ts                    # ブラウザTTSラッパ
├─ pipeline/                    # サーバ側の選曲ロジック
│  ├─ definitions.ts            # ★カード/スライダーの意味定義の単一ソース
│  │                            #   （年代レンジ・審査条件の抽出もここから導出）
│  ├─ core.ts                   # 方針/候補生成、審査(judge)、Spotify解決(原曲優先)、ナレーション
│  └─ fallback.ts               # リプレイ選定・種曲・言語ドリフト検知
├─ server/
│  ├─ spotifyAuth.ts            # トークン管理（httpOnly Cookie、APP_BASE_URL依存）
│  ├─ openai.ts                 # OpenAI呼び出し（JSON応答、キーtrim防御）
│  └─ policyCache.ts            # 方針キャッシュ（fill/warm共有。プロセス内Map）
└─ logs/
   ├─ schema.ts                 # QueueItem / SegmentLog 型
   └─ store.ts                  # 二層ストア（DATABASE_URLありPG/なしNDJSON）冪等追記+パッチ
```

## 3. 各系統の構造

- **認証**: PKCE。`/api/auth/login`→Spotify→`/api/auth/callback`でトークン交換、httpOnly Cookieに保存（sp_access/sp_refresh/sp_expires/sp_uid）。`getAccessToken()`が期限切れ前リフレッシュ。リダイレクトURIは `APP_BASE_URL + /api/auth/callback` で導出
- **再生エンジン**: 開始ボタン→SDKロード→player.connect→開局ジングル（裏で初回fill並走）→曲。700msポーリングで残り時間監視、残り45秒でバッファ(<2)補充、残り1秒で遷移。曲末フォールバック（停止&位置0）は再生実績30秒超のときのみ。skippedはログに残る
- **fill API（1回=1曲）**: 方針(キャッシュ)→候補4件(LLM)→審査(カード+極値温度のみ、知らない曲は通す)→解決(アーティスト不一致棄却・原曲優先スコア)→重複/クールダウン/年代/言語ゲート→ナレーション→ログ下書き。失敗時はL2拡大→L3年代緩和→L4リプレイ→L5種曲。**503はSpotify検索自体が死んでいるときだけ**
- **除外**: セッション内全曲+全セッション横断の直近7日（normalizeName正規化キー）。アーティストは直近10曲クールダウン
- **ログ**: 1曲=1行。fill時に下書き→再生/評価でPATCH。`GET /api/log?limit=200` で閲覧（要ログイン）。評価の意味は**カード適合**
- **演出**: inserts.tsが曲間の挿入物を返す。時報=55分〜で1回、残り分数を発話+鐘。ジングル=4〜6曲ごと+開局時。局名コール音声は開始時に先読みキャッシュし、読み上げ設定と無関係に再生

## 4. デプロイ状況

- **本番**: Vercel（プロジェクト名 triwx）。URL: https://triwx.vercel.app。GitHubリポジトリ `Triwx`（private）のmainへのpushで自動デプロイ
- **DB**: Neon (Postgres) をVercel Storageから接続済み。テーブル`segments`は初回アクセス時に自動作成
- **Vercelの環境変数（必須3+自動1）**:
  - `SPOTIFY_CLIENT_ID`
  - `OPENAI_API_KEY`
  - `APP_BASE_URL` = `https://triwx.vercel.app`（末尾スラッシュなし）
  - `DATABASE_URL`（Neon接続で自動注入）
  - 任意: `OPENAI_MODEL` / `OPENAI_TTS_MODEL` / `OPENAI_TTS_VOICE` / `TRIW_CODE_VERSION`
  - **変更後は必ずRedeploy**（反映されない事故が2回起きている）
- **Spotify Developer Dashboard**: Redirect URIs に本番とローカルの両方を登録済みであること:
  - `https://triwx.vercel.app/api/auth/callback`
  - `http://127.0.0.1:3000/api/auth/callback`
  - User Management に利用者（最大5人・全員Premium）を登録

## 5. 既知の制約

- **Spotify規約（2026-02改定）**: Dev Modeは開発者含め最大5ユーザー・全員Premium必須・1アカウント1アプリ。拡張申請は個人には事実上閉鎖
- **廃止済みAPI**: audio features（danceability等, 2024-11廃止）、人気度メトリクス等（2026-02）。**旧知識で「audio featuresで検証しよう」と設計しないこと**
- 再生はブラウザタブ内（タブを閉じると止まる。仕様として許容中）
- policyCacheはserverlessインスタンス内メモリ。消えても方針が再生成されるだけ（実害なし・仕様）
- Spotify検索の発売年はコンピ/再発で不正確なことがある（1919年のMonkees等を観測）
- Spotify検索429時、そのfillは諦めて次周期に任せる設計

## 6. 直近で入れた修正（新しい順）

- APIキーの改行・空白混入への trim 防御（本番で実際にHeaders.appendエラーが発生したため）
- 演出音声（局名コール・時報）の1.8倍増幅、ファビコン、/about
- 一括修正: 7日減衰の全セッション重複除外/語面連想禁止/中立重力対策/Take◯マーカー/時報の作法（55分窓・鐘・残り分数）/開局ジングル/局名コールの独立/方針ウォームアップ+旧バッファ整理/時間帯カード排他/ランプ3段階/一時停止誤スキップ防御/評価ラベル「カードに合ってる?」
- 審査デッドロック解消（カード+極値温度のみ判定・知らない曲は通す）、原曲優先解決、アーティスト10曲クールダウン
- 経緯の全量は git log と PROJECT.md §6 参照

## 7. 次にやるべきこと

`ROADMAP.md` の短期項目から。最優先は **T1（本番ログでの安定化観測）** と **T4（散らし具合レポート）**。T4は設計原則3（散らばりを客観測定する）の測定装置がまだ無い、という欠落を埋めるもの。

## 8. 次のAIが誤解しやすい点（要注意）

- **旧TRIW（Next.js+同名の前身プロジェクト）とは別物**。設計・コード・ログの互換は一切ない。本リポジトリが唯一の正
- **◎✕は好みではない**。「好み学習で選曲をパーソナライズ」は改善ではなく設計原則違反
- **フォールバック発動はバグではない**。無音にしないための仕様。ただし発動「率」が高いのは上流の異常シグナル（fallbackReasonで監視）
- **審査を厳しくする=品質向上ではない**。過去にデッドロック→条件無視曲の混入を起こした（PROJECT.md §6）
- **重複が7日で復帰するのは仕様**。恒久除外に"修正"しないこと
- **履歴をプロンプトに戻さない**。重複排除はコードの仕事
- **ダイアル・ランプは計器**。飾りの周波数表示等に戻さない
- **Spotifyの旧API知識（audio features/人気度/25ユーザー）は使えない**
