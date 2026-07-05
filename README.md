# TRIWX — AI選曲・連続ラジオ（MVP）

開くと音楽が流れ続け、曲間に短いつなぎコメントが入る「自分専用の連続ラジオ」。
Spotify Web Playback SDK（要Premium）+ OpenAI + ブラウザTTS。

## セットアップ（1回だけ・約10分）

### 1. Spotifyアプリを作る
1. https://developer.spotify.com/dashboard を開いてログイン
2. 「Create app」→ 名前は自由（例: triwx）
3. **Redirect URIs** に次を1行追加して保存:
   `http://127.0.0.1:3000/api/auth/callback`
4. **Web Playback SDK** にチェック（APIs usedの選択がある場合）
5. 作成後の画面で **Client ID** をコピー

### 2. 環境変数
```bash
cp .env.local.example .env.local
```
`.env.local` を開いて2行を埋める:
- `SPOTIFY_CLIENT_ID=`（↑でコピーしたもの）
- `OPENAI_API_KEY=`（OpenAIのキー）

### 3. 起動
```bash
npm install
npm run dev
```
ブラウザで **http://127.0.0.1:3000** を開く（localhostではなく127.0.0.1で）。

### 4. 使う
1. 「Spotifyでログイン」→ 許可
2. 「▶ ラジオを始める」
3. あとは流れ続けます。カード・スライダーは再生中に変更可（次の選曲から効く）
   - 「ことば・地域」カードで日本語・韓国・アジア・ラテン・アフリカ・欧州（非英語）・世界を旅する、の選曲切替ができます
4. 曲ごとに ◎○✕ とメモ → `data/sessions/*.ndjson` に記録されます

## 読み上げモード
再生画面の「読み上げ」トグルで切替:
- **オフ**: コメントはテキスト表示のみ（読める間を置いて次の曲へ）
- **標準**: ブラウザ内蔵の音声（無料・品質は環境依存）
- **高音質**（既定）: OpenAI TTS。自然な日本語。コストは1時間聴いて数円程度
  - `.env.local` の `OPENAI_TTS_VOICE`（既定 sage）/ `OPENAI_TTS_MODEL`（既定 gpt-4o-mini-tts）で声を変更可

## Webに公開する（Vercel + Neon、無料枠でOK）

**重要な前提**: Spotifyの規約変更（2026年2月）により、公開しても使えるのは
Spotifyダッシュボードの許可リストに登録した**最大5アカウント**（自分含む・全員Premium必須）です。
自分と身近な人で使う前提のデプロイです。

### 手順（初回のみ・約15分）
1. **GitHubにpush**（プライベートリポジトリでOK）
2. **Vercel** (https://vercel.com) → Add New → Project → リポジトリをImport
   - Environment Variables に以下を追加してDeploy:
     - `SPOTIFY_CLIENT_ID`（ローカルと同じ）
     - `OPENAI_API_KEY`
     - `APP_BASE_URL` = `https://<プロジェクト名>.vercel.app`（デプロイ後に確定したURLを入れて再デプロイでも可）
3. **ログ保存用DB**: Vercelのプロジェクト画面 → Storage → Create Database → **Neon (Postgres)** → Connect
   - `DATABASE_URL` が自動で環境変数に追加される。テーブルは初回アクセス時に自動作成
4. **Spotifyダッシュボード** (https://developer.spotify.com/dashboard) → 自分のアプリ → Settings:
   - Redirect URIs に `https://<プロジェクト名>.vercel.app/api/auth/callback` を**追加**（ローカル用は残してよい）
   - User Management: 使う人（最大5人・Premium必須）の名前とSpotifyメールを登録
5. Vercelで **Redeploy** → `https://<プロジェクト名>.vercel.app` を開いて動作確認

### ログについて
- 本番: Neon Postgresの `segments` テーブルに保存（1曲=1行、評価・メモ込み）
- ローカル: 従来どおり `data/sessions/*.ndjson`（DATABASE_URLを.env.localに入れれば本番と同じDBも使える）
- 閲覧/エクスポート: ログイン済みブラウザで `/api/log?limit=200` を開くとJSONで取得できる

## 実装済み
連続再生 / 曲間ナレーション（表示+読み上げ）/ 先読み2曲バッファ / 再生中の条件変更（次以降に反映・転調コメント）/ スキップ / 評価・メモ / セッションログ（冪等）/ アーティスト不一致の棄却

## MVPの既知の制約
- Spotify Premium必須。ブラウザタブを閉じると止まる（ラジオはタブの中に住んでいる）
- TTSはOS標準音声（品質は環境依存。差し替え口は narrate/tts に分離済み）
- 方針キャッシュはdevプロセス内メモリ（再起動で消える。実害なし）
- 本番デプロイ・複数ユーザーは未対応（意図的にスコープ外）
