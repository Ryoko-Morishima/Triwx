# TRIWX — AIが選曲しつづける、終わらないラジオ

開くと音楽が流れつづけ、曲間に短い曲紹介が入り、ときどき時報とジングルが鳴る個人ラジオ局。
Spotify Web Playback SDK（**要Premium**）+ OpenAI + Next.js。

- 目的と設計原則: `PROJECT.md` ／ 開発ルール: `AGENTS.md` ／ 引き継ぎ: `HANDOFF.md` ／ 予定: `ROADMAP.md` と `tasks/`

## ローカル起動

### 1. Spotify Developer Dashboard（初回のみ）
1. https://developer.spotify.com/dashboard → Create app（名前は自由）
2. **Redirect URIs** に追加: `http://127.0.0.1:3000/api/auth/callback`
3. **User Management** に自分（と使う人、最大5人・全員Premium）の名前とSpotifyメールを登録
4. **Client ID** をコピー

### 2. 環境変数
```bash
cp .env.local.example .env.local
```
`.env.local` を編集:
- `SPOTIFY_CLIENT_ID=`（↑のClient ID）
- `OPENAI_API_KEY=`（sk-で始まるキー。**改行・前後の空白を入れないこと**）

⚠️ **`.env.local` は絶対にコミットしない**（.gitignore済み。`git status`に出たら異常）

### 3. 起動
```bash
npm install
npm run dev
```
**http://127.0.0.1:3000** を開く（localhostではなく127.0.0.1で。Redirect URIと一致させるため）。
ログイン → 「▶ 放送をはじめる」。

## Vercelデプロイ

1. GitHub（privateでよい）へpush
2. https://vercel.com → Add New → Project → リポジトリをImport
3. Environment Variables に3つ入れてDeploy:
   - `SPOTIFY_CLIENT_ID` / `OPENAI_API_KEY`
   - `APP_BASE_URL` = `https://<プロジェクト名>.vercel.app`
4. プロジェクト → **Storage** → Create Database → **Neon** → Connect（`DATABASE_URL`が自動追加。ログ保存用）
5. Spotify Dashboard → Redirect URIs に `https://<プロジェクト名>.vercel.app/api/auth/callback` を**追加**
6. Deployments → 最新の「…」→ **Redeploy**（環境変数を確実に読ませる）

### APP_BASE_URL とは
このアプリが「自分の公開URL」を知るための変数。Spotify認証の戻り先とCookieのsecure属性がここから導出される。
**実際のURLと一字一句一致**させること（https、末尾スラッシュなし）。未設定だと既定の `http://127.0.0.1:3000` に落ち、
本番でログイン後にローカルへ飛ばされる（実際に起きた事故）。

## よくあるトラブル

| 症状 | 原因と対処 |
|---|---|
| ログイン後に 127.0.0.1:3000 に飛ぶ | `APP_BASE_URL` 未設定/タイポ/Redeploy忘れ。設定→Redeploy |
| ナレーションが曲名を言うだけの定型文になる | OpenAI呼び出しが失敗している（定型文は放送を止めないためのフォールバック）。`OPENAI_API_KEY`の未設定・**改行/空白混入**を疑う。Vercel Logsに `buildNarration failed` や `Headers.append` が出ていれば確定 |
| 選曲が種曲リスト（September, Dreams, プラスティック・ラブ等）ばかり | 同上（候補生成が全滅しseed層が発動）。`/api/log?limit=5` の `source` が `"seed"` なら確定 |
| Vercelで500・「DATABASE_URLが必須です」 | Storage画面からNeonを接続 → Redeploy |
| アカウントエラー（Premiumが必要） | 再生アカウントがPremiumでない、またはUser Management未登録 |
| 環境変数を直したのに変わらない | **Redeployするまで反映されない**（Vercelの仕様） |
| ジングル・時報が鳴らない | 「時報・ジングル」トグルがオフ／ブラウザの自動再生制限（開始ボタンから始めれば解錠される） |
| favicon が変わらない | ブラウザキャッシュ。ハードリロード |

### /api/queue/fill が失敗したときの確認方法
1. ログイン済みブラウザで `/api/log?limit=10` → 各行の `source` / `fallbackReason` / `judgeRejected` を見る
2. Vercel → プロジェクト → **Logs** で `/api/queue/fill` の赤い行を読む（`generateCandidates failed` = OpenAI系、`429` = Spotifyレート制限、`no track resolved` = Spotify検索まで全滅）
3. fillが503を返すのはSpotify検索自体が落ちているときだけ（= 再生も不可能な状況）。それ以外は多層フォールバックで必ず1曲返る設計

## ログ
- ローカル: `data/sessions/*.ndjson`（コミットされない）／ 本番: Neonの `segments` テーブル
- 閲覧: ログイン済みブラウザで `/api/log?limit=200`
- ◎○✕は「好き嫌い」ではなく**「カードに合っていたか」**の判定（詳細は /about と PROJECT.md）
