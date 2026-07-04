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

## 実装済み
連続再生 / 曲間ナレーション（表示+読み上げ）/ 先読み2曲バッファ / 再生中の条件変更（次以降に反映・転調コメント）/ スキップ / 評価・メモ / セッションログ（冪等）/ アーティスト不一致の棄却

## MVPの既知の制約
- Spotify Premium必須。ブラウザタブを閉じると止まる（ラジオはタブの中に住んでいる）
- TTSはOS標準音声（品質は環境依存。差し替え口は narrate/tts に分離済み）
- 方針キャッシュはdevプロセス内メモリ（再起動で消える。実害なし）
- 本番デプロイ・複数ユーザーは未対応（意図的にスコープ外）
