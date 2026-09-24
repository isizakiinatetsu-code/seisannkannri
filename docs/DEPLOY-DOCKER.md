# 納入管理システム Docker 本番運用手順（Vercel → 自社サーバー / VPS）

この手順で、Vercel をやめて自社で用意したサーバーに移せます。
**データ（Supabase の DB・伝票画像）は今のまま**で、アプリ部分だけを移します。移行してもデータは消えません。

---

## 0. 全体像

```
利用者（事務所・外出先・現場のスマホ）
        │ https://nouhin.example.co.jp
        ▼
┌─────────── サーバー（Docker）───────────┐
│  Caddy（HTTPS終端・証明書を自動取得/更新）│
│        │                                  │
│  app（納入管理システム Next.js）          │
└───────────────┬──────────────────────────┘
                ▼
        Supabase（DB・画像）※今のまま
```

| 役割 | 担当 | 備考 |
|---|---|---|
| HTTPS 証明書の取得・更新 | Caddy が自動 | 手作業不要（Let's Encrypt・約60日ごと自動更新） |
| 落ちた時の自動再起動 | Docker（`restart: unless-stopped`） | サーバー再起動後も自動で立ち上がる |
| ログの肥大化防止 | Docker（10MB×5世代で自動ローテーション） | |
| 死活監視 | コンテナの HEALTHCHECK（30秒ごと） | 外部監視は「5. 運用」参照 |

---

## 1. 置き場所の決め方（重要）

このシステムは **外出先・現場からも使う** 前提のため、**インターネットから届くサーバー** が必要です。
また、ログインは **HTTPS 必須** です（HTTP だとログインできない仕様）。

| 置き場所 | おすすめ度 | 必要なもの |
|---|---|---|
| **VPS**（さくらのVPS / ConoHa / Xserver VPS など） | ◎ 推奨 | 月1,000〜2,000円程度・固定IPが最初から付く。ルーター設定不要 |
| 社内サーバー | △ | **固定グローバルIP** ＋ ルーターで 80/443 番ポートを転送 ＋ 停電・回線障害時は全員使えない |

**推奨スペック**：メモリ 2GB 以上、ディスク 20GB 以上、OS は Ubuntu 22.04/24.04 LTS。
（アプリは約330MBのイメージ。1台で十分動きます）

---

## 2. 事前準備

1. **ドメイン**：例 `nouhin.会社ドメイン` を用意し、DNS の **A レコードをサーバーのIP** に向ける。
2. **ファイアウォール**：80 番・443 番ポートを開ける（22 番＝SSHは管理用）。
3. **Docker をインストール**（Ubuntu の場合）
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER   # 再ログイン後 sudo なしで docker が使える
   ```

---

## 3. 初回セットアップ

```bash
# ① プログラムを取得
git clone https://github.com/isizakiinatetsu-code/seisannkannri.git
cd seisannkannri

# ② 環境変数ファイルを作る
cp .env.example .env
nano .env
```

`.env` には **今の Vercel の値をそのまま写します**
（Vercel → プロジェクト → Settings → Environment Variables）。
`DOMAIN=` には手順2で用意したドメインを入れます。

> ⚠ `.env` にはパスワードや鍵が入ります。**他人に渡さない・Git に入れない**（.gitignore 済み）。

```bash
# ③ ビルドして起動（初回は数分）
docker compose up -d --build

# ④ 状態確認（app が healthy、caddy が Up ならOK）
docker compose ps
```

ブラウザで `https://ドメイン` を開き、ログインできれば完了です。
（初回アクセス時に Caddy が証明書を自動取得します。数十秒かかることがあります）

---

## 4. 切り替え手順（Vercel からの移行）

1. 上記3を行い、新サーバーで **ログイン・カレンダー表示・予定追加・画像アップロード・Sheets同期** を確認。
2. 問題なければ、利用者に新しいURLを案内（ホーム画面に追加している人は追加し直し）。
3. 1〜2週間ほど並行運用し、問題が無ければ Vercel のプロジェクトを停止。

※ DB は共通なので、並行運用中はどちらで入力しても同じデータが見えます。

---

## 5. 日常の運用

| やりたいこと | コマンド |
|---|---|
| 状態を見る | `docker compose ps` |
| ログを見る | `docker compose logs -f app`（Ctrl+C で抜ける） |
| 再起動 | `docker compose restart app` |
| 停止 / 起動 | `docker compose down` / `docker compose up -d` |

### プログラムを更新するとき（改修を反映）

```bash
cd seisannkannri
git pull
docker compose up -d --build
docker image prune -f    # 古いイメージを削除してディスクを空ける
```

### 外部からの死活監視（推奨・無料）

[UptimeRobot](https://uptimerobot.com/) などで `https://ドメイン/login` を5分ごとに監視し、
落ちたらメール通知する設定にしておくと安心です。

### 障害時の切り戻し

Vercel のプロジェクトを削除せず残しておけば、URL を戻すだけで元の環境に戻せます。

---

## 6. Vercel との違い（知っておくこと）

- **処理の時間制限が無くなる**：Vercel 無料枠の「10秒で打ち切り」が無いため、Sheets 同期などの重い処理が途中で止まらなくなります。
- **サーバーの保守は自社**：OS のセキュリティ更新（`sudo apt update && sudo apt upgrade`）を月1回程度行ってください。
- **バックアップ**：データは Supabase 側にあるため、サーバーが壊れても `.env` さえ控えておけば、別サーバーで3の手順をやり直すだけで復旧できます。**`.env` は安全な場所に控えを保管**してください。
