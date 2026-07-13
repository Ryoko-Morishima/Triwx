# T4: 散らし具合レポート（設計原則3の測定装置）

- ステータス: done（2026-07-13）
- 依存: なし（本番ログがあるほど価値が出る）

## 背景
設計原則3「条件内で最大限散らす。散らばりはログから客観的に測る」の測定装置が未実装。これまでの散らばり分析（Stooges頻出・20曲窓の発見等）はすべて手作業だった。データは全部ログにある。

## 目的
セッション/期間の散らばりを自動集計し、人間とAIが同じ数字を見て判断できるようにする。

## 触ってよいファイル
- 新設 `src/logs/stats.ts`（純関数の集計ロジック。単体テスト可能に）
- `src/app/api/log/route.ts`（GETに `?stats=1` 等で集計を返す）
- 表示が必要なら新設 `src/app/stats/page.tsx`（まずはJSONで十分。UI化は人間の要望を聞いてから）

## 触らないほうがよいファイル
- fill/engine（読むだけ。集計のために選曲側へフィールドを足したくなったら別タスクに切る）

## 実装方針
指標の初期セット: アーティスト重複率、同一曲の7日内重複（0であるべき）、年代分布（min/max/中央値/十年紀ヒストグラム）、言語分布（JPスクリプト比。他言語は将来）、source/fallbackReason率、judgeRejected分布、評価の集計（◎○✕率）。conditionSnapshot単位（同一カード構成ごと）の内訳も出せると診断に効く。

## 完了条件
- `/api/log?stats=1`（要ログイン）で上記が返る
- 集計ロジックに単体テスト相当の検証（esbuildバンドル+nodeで可）がある
- HANDOFF.md にレポートの読み方を追記

## 人間が確認すること
- 指標の見せ方の好み（JSONで足りるか、画面が欲しいか）

## 動作確認手順
1. ローカルで数曲流す→ `/api/log?stats=1` の数字が手数えと一致
2. 本番でも同URLで取得できる

## 実装結果（2026-07-13）

- `src/logs/stats.ts` 新設: `computeDiversityStats(segments)` 純関数。プロジェクト内import は型のみ（`@/logs/schema`）+ `normalizeName`（`@/pipeline/core`）+ `hasJapaneseScript`（`@/pipeline/fallback`）に限定し、実運用の重複判定・言語判定ロジックと完全に一致させた
- 出す指標: アーティスト重複率+上位重複、同一曲7日内重複件数（本来0が期待値。仕様上replayは例外的にこの窓を跨いで再生し得るため、0でなくてもすぐ異常ではない。0でない場合はsource内訳と突き合わせること）、年代分布（min/max/中央値/十年紀ヒストグラム）、言語分布（JPスクリプト比）、source率、fallbackReason率、judgeRejected平均値、resolveMetaのtitle/artist不一致率、評価（◎○✕）集計、conditionSnapshot（cards構成）単位の内訳
- `src/app/api/log/route.ts` の GET に `?stats=1` を追加（`limit`/`sessionId` は既存パラメータ流用。例: `/api/log?stats=1&limit=1000`）
- 検証: 本番ログのエクスポート（`log.json`, 150件）に対し実行。source/fallbackReason/feedbackの内訳合計が総数150と一致することを確認、`lang_ja+midnight`条件のbadRate高さが手元で見ていた「夜更け感がない」評価の集中と一致することを目視確認。テストランナー未導入のため、`@/`エイリアスを相対importに機械置換したコピーを`tsc --module commonjs`で単発トランスパイルし`node`実行する方法で検証（使い捨てディレクトリ、コミットなし）
- 発見事項（要観察）: 実データに同一曲が7日未満で11件重複。大半はsource=replayによる意図的な再放送とみられるが、"Isn't She Lovely"は6分差での重複がありreplay層の重複ガードを見直す価値があるかもしれない（T1と合わせて確認推奨）

## 中断時の引き継ぎ欄
（次の一手: UI化 `src/app/stats/page.tsx` は未着手。現状JSONのみ。人間がJSONで足りるか確認してから判断）
