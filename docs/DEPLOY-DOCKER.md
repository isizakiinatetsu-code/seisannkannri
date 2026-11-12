# 納入管理システム Docker 本番運用手順（Vercel → 自社サーバー）

この手順で、Vercel をやめて自社で用意したサーバーに移せます。
**データ（Supabase の DB・伝票画像）は今のまま**で、アプリ部分だけを移します。移行してもデータは消えません。

運用方法は2通りあります。環境に合わせてどちらかを選んでください。

| 方式 | 置き場所 | アクセス | HTTPS | 手順 |
|---|---|---|---|---|
| **社内LAN版** | 社内の常駐PC | 社内LANのみ | 不要（HTTP） | 下の「★社内LAN版」 |
| インターネット公開版 | VPS 等 | 外出先・現場からも | 必須（Caddyが自動取得） | 「0. 全体像」以降 |

> このプロジェクトの既定の移行先は **社内LAN版（常駐PC・HTTP）** です。
> まずそちらを読んでください。VPS/公開版は将来インターネット公開したくなった時用に残しています。

---

## ★社内LAN版（Windows常駐PC・HTTP）

社内LANの中だけで使う構成です。**インターネット公開・固定グローバルIP・ドメイン・証明書はすべて不要**。
各端末（PC・スマホ）からは `http://（常駐PCの固定ローカルIP）` でアクセスします（例: `http://192.168.1.252`）。

使うファイル: [`docker-compose.lan.yml`](../docker-compose.lan.yml)（Caddyなし・HTTP直結）。

### 前提
- 常駐PC（Windows 10/11）を1台用意し、**電源を入れっぱなし**にできること。
- その常駐PCの **ローカルIPを固定**しておくこと（例: 192.168.1.252）。
  DHCPのままだとIPが変わって全端末が繋がらなくなります。
  - ルーター側で「DHCP予約（固定割当）」にする、または Windows の
    「ネットワーク設定 → アダプターのオプション → IPv4 → IPアドレスを手動設定」で静的IPにする。

### 1. Docker Desktop を入れる（常駐PC）
1. [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) をインストール（WSL2 バックエンドの既定でOK）。
2. インストール後に Docker Desktop を起動し、タスクトレイのクジラが安定（緑）になるまで待つ。
3. Docker Desktop の設定 → General で **「Start Docker Desktop when you sign in to your computer」にチェック**（PC再起動後も自動で立ち上がる）。
   - ※ Windows は「サインイン後」に Docker が起動します。常駐運用では、PC起動時に自動サインインする設定にしておくと、停電復帰後なども無人で復旧します。

### 2. プログラムと設定を置く（常駐PC）
1. このリポジトリを常駐PCに取得（`git clone` か、ZIPをダウンロードして展開）。
2. フォルダ内の `.env.example` を `.env` という名前でコピーし、値を入れる。
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `EDIT_PASSWORD` / `VIEW_PASSWORD` / `SESSION_SECRET` / Google 連携の値は、**今の Vercel の Settings → Environment Variables の値をそのまま写す**。
   - **`COOKIE_SECURE=false` を設定する**（HTTPでログインできるようにするため。社内LAN版では必須）。
   - `DOMAIN` は社内LAN版では使わないので空のままでよい。

   > ⚠ `.env` にはパスワードや鍵が入ります。他人に渡さない・Git に入れない（.gitignore 済み）。

### 3. 起動する（常駐PC）
PowerShell かコマンドプロンプトでフォルダに移動して:
```powershell
docker compose -f docker-compose.lan.yml up -d --build
docker compose -f docker-compose.lan.yml ps      # app が Up / healthy ならOK
```

初回の起動時、Windows Defender ファイアウォールが通信許可を聞いてきたら、
**「プライベートネットワーク」にチェックを入れて許可**（社内LANの他端末から届くようにするため）。

### 4. 各端末からアクセス
ブラウザで `http://192.168.1.252`（= 常駐PCの固定IP）を開き、パスワードでログインできれば完了です。
よく使う人はホーム画面に追加しておくと便利です。

### 5. 日常の操作（社内LAN版）
| やりたいこと | コマンド（フォルダ内で実行） |
|---|---|
| 状態を見る | `docker compose -f docker-compose.lan.yml ps` |
| ログを見る | `docker compose -f docker-compose.lan.yml logs -f app` |
| 再起動 | `docker compose -f docker-compose.lan.yml restart app` |
| 停止 / 起動 | `docker compose -f docker-compose.lan.yml down` / `... up -d` |
| 更新（改修を反映） | `git pull` の後 `docker compose -f docker-compose.lan.yml up -d --build` |

### 6. 切り替え（Vercel から）
1. 上記で社内LAN版を起動し、**ログイン・カレンダー表示・予定追加・画像アップロード・Sheets同期**を確認。
2. 問題なければ利用者に新URL `http://192.168.1.252` を案内。
3. 1〜2週間ほど並行運用し、問題が無ければ Vercel を停止。DBは共通なので、どちらで入力しても同じデータが見えます。

> **補足**: データ（DB・伝票画像）は引き続き Supabase にあります。常駐PC が壊れても、`.env` さえ控えておけば別PCで上記をやり直すだけで復旧できます。`.env` は安全な場所に控えを保管してください。

---

> 以下「0. 全体像」以降は **インターネット公開版（VPS・HTTPS）** の手順です。社内LAN版だけで使う場合は読む必要はありません。

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
