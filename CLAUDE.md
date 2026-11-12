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

## 自社サーバー移行（2026-11-12 決定・実装済み）
Vercel をやめ、**アプリだけを社内の常駐PCへ移す**方針で確定。データ（DB・伝票画像）は **Supabase 併用のまま**（＝完全自己ホストの Phase B は見送り）。

### 確定事項
- **置き場所**: 社内の常駐PC（Windows 10/11）。IP は `192.168.1.252`（固定IP前提）。
- **アクセス範囲**: 社内LANのみ（外部公開・固定グローバルIP・ドメインは不要）。
- **HTTPS**: 社内LANのため Let's Encrypt は使えない → **HTTPで運用**し、ログインCookieの `secure` を環境変数で切替（B案）。
- **データ**: Supabase（Postgres + Storage）をそのまま利用。

### 実装済み（コミット eb570e1）
- `app/api/auth/login/route.ts`: `secure` を `process.env.COOKIE_SECURE !== 'false'` に（既定 true、LAN運用時のみ `.env` で `COOKIE_SECURE=false`）。
- `docker-compose.lan.yml`（新規）: Caddyなし・`80:3000` でHTTP直結。既存 `docker-compose.yml`（VPS/公開+HTTPS版）は将来用に温存。
- `.env.example`: `COOKIE_SECURE` と社内LAN運用の注記を追加。
- `docs/DEPLOY-DOCKER.md`: 「★社内LAN版（Windows常駐PC・HTTP）」の手順を追加。
- 既存の Docker化は PR #150（Dockerfile / docker-compose.yml / Caddyfile / docs/DEPLOY-DOCKER.md）。

### 残り（ユーザー側の実作業）
常駐PCで: 固定IP化 → Docker Desktop導入（サインイン時に自動起動）→ `.env` 作成（Vercelの値＋`COOKIE_SECURE=false`）→ `docker compose -f docker-compose.lan.yml up -d --build` → 各端末から `http://192.168.1.252`。初回のWindowsファイアウォールは「プライベート」で許可。

### 補足：Phase B（Supabase不使用・完全自己ホスト）について【見送り】
「データも社外に出したくない」場合の選択肢として検討したが、今回は見送り。やる場合に必要なのは:
Postgres をDocker同梱 / 約13本のAPIの `supabase.from(...)` を Postgres ドライバへ書き換え / 画像保存をローカル(またはMinIO)へ / Supabaseからデータ＋画像(約245MB)を移行 / バックアップ(pg_dump＋画像フォルダ)を自前構築。規模が大きいので、やるなら要件を詰めてから設計・計画に落とす。
