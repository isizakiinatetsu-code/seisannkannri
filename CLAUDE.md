@AGENTS.md

# プロジェクト方針メモ（納入管理システム）

## アプリ概要
鋼材・建材の「納入管理システム」。納入予定をカレンダー/リスト/OCRタブで管理する Next.js 16 + React 19 + TypeScript アプリ。

## 共有運用に向けた決定事項（要件確定済み）
- **複数人での共有が前提**。
- **ホスティング**: クラウド（Vercel / サーバーレス）。
- **アクセス範囲**: 外出先・現場からも利用（インターネット越し）。
- **認証**: 必要。誰が操作したか（操作者）も記録する。
- **バックエンド**: Supabase（Postgres + Storage + Auth を一括利用）。

## 現状（移行前）の構成と、共有での不足点
- DB: `better-sqlite3`（ローカルファイル `data/deliveries.db`）→ サーバーレスでは動かない。
- 画像: `public/uploads/` にローカル保存 → サーバーレスでは消える。
- 認証: なし → 誰でも閲覧/編集/削除可能、操作者記録なし。
- 同時編集制御なし（`updated_at` はあるが楽観ロック未使用）。
- リアルタイム反映なし（手動再取得のみ）。
- 本番デプロイ設定なし（`localhost:8080` 前提）。

## 実装計画（Supabase + Vercel）
1. DB層を Supabase(Postgres) へ移植（`lib/db.ts` 置換、スキーマSQL、SQLite→Postgres方言調整）。
2. API書き換え（`app/api/deliveries/*`, `app/api/excel/route.ts` を Supabase 経由に）。
3. 画像を Supabase Storage へ（`app/api/upload/route.ts`、URLをDB保存）。
4. 認証追加（ログインページ + `middleware.ts` + 各API検証）。
5. 操作者記録/監査（`created_by`/`updated_by` カラム、変更履歴テーブル、UI表示）。
6. 同時編集対策（`updated_at` 楽観ロック）。
7. 環境変数化・Vercelデプロイ設定（`.env.example` + 手順）。

推奨進行: まず①〜③（データ層をSupabase化＝複数人で同じデータが見える核）を実装→検証後に④〜⑥。

## ユーザー側で用意が必要なもの（実稼働に必須）
- Supabase プロジェクト（無料）の URL と APIキー。
- それを Vercel と `.env` に設定（手順はドキュメント化する）。
- ※これらはこの実行環境からは作成できない。

## 注意
- AGENTS.md の指示どおり、コードを書く前に `node_modules/next/dist/docs/` のガイドを読む（この版は破壊的変更あり）。`node_modules` は未インストール状態のため要 `npm install`。
- OCRタブは名前だけで、実際はOCR未実装（画像保存のみ）。
- 作業ブランチ: `claude/analyze-repo-contents-vsl5Y`。

## 保留中：常駐PCへの完全Docker移行（上長依頼・回答待ち）
上長依頼：Vercel/Supabase をやめ、社内の常駐PC1台に Docker で構築し、そこへアクセスする方式にする（自分のPCで構築→そのまま配布）。
- 済：アプリのDocker化（PR #150：Dockerfile / docker-compose.yml / Caddyfile / docs/DEPLOY-DOCKER.md）。
- 追加で必要：Postgres をDocker同梱、Supabaseからデータ移行、伝票画像(約245MB)をローカル保存へ、Supabase依存コード置換、バックアップ仕組み。
- 上長へ確認中（回答待ち）：
  1. 外出先・現場からのアクセス（社内のみ / VPN / 外部公開）
  2. HTTPS（ログインCookieが secure 固定のためHTTPS必須。社内LANなら自己署名 or 緩和）
  3. 「配布」の意味（常駐PC1台のみ / 他拠点へも配布）
  4. 常駐PCのOS・メモリ
  5. バックアップ先（NAS / 外付けHDD / Googleドライブ）
  6. Googleスプレッドシート連携の継続可否
回答が来たら上記を前提に構築を再開する。
