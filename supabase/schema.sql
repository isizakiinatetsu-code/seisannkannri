-- 納入管理システム: Supabase (Postgres) スキーマ
-- Supabaseダッシュボード > SQL Editor で実行する

create table if not exists deliveries (
  id bigint generated always as identity primary key,
  delivery_date date not null,
  delivery_time text,
  project_name text not null,
  item text not null,
  specification text,
  vendor text not null,
  unload_location text not null,
  storage_location text,
  quantity numeric,
  unit text,
  order_number text,
  notes text,
  status text not null default '予定' check (status in ('予定', '納入済み')),
  delivered_at timestamptz,
  slip_image_path text,
  created_by text, -- 追加者（部署）: 購買課 / 総務部
  is_partial boolean not null default false, -- 一部納入（分納の途中）フラグ
  deleted boolean not null default false, -- ソフトデリート（削除済み。Sheet同期で復活させないため物理削除しない）
  sheet_no text, -- スプレッドシートの「No」（行を一意に識別する管理番号）。同期の照合に使う
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 既存テーブルに列を足す（新規作成時は上のCREATEに含まれる）
alter table deliveries add column if not exists created_by text;
alter table deliveries add column if not exists is_partial boolean not null default false;
alter table deliveries add column if not exists deleted boolean not null default false;
alter table deliveries add column if not exists sheet_no text;
alter table deliveries add column if not exists unloaded_by text; -- 荷下ろし者（担当者名）
create index if not exists idx_deliveries_sheet_no on deliveries (sheet_no);

-- 荷下ろし（連絡）担当者：その日ごとの連絡先を1人保存する
create table if not exists daily_contacts (
  contact_date date primary key,
  contact text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_deliveries_delivery_date on deliveries (delivery_date);
create index if not exists idx_deliveries_status on deliveries (status);

-- 検索の部分一致(ILIKE '%...%')を高速化するトライグラム索引。
-- 先頭ワイルドカードのILIKEは通常のB-tree索引が効かないため、pg_trgm + GIN を使う。
create extension if not exists pg_trgm;
create index if not exists idx_deliveries_project_trgm on deliveries using gin (project_name gin_trgm_ops);
create index if not exists idx_deliveries_vendor_trgm on deliveries using gin (vendor gin_trgm_ops);
create index if not exists idx_deliveries_unload_trgm on deliveries using gin (unload_location gin_trgm_ops);
create index if not exists idx_deliveries_item_trgm on deliveries using gin (item gin_trgm_ops);

create table if not exists delivery_slips (
  id bigint generated always as identity primary key,
  delivery_id bigint not null references deliveries (id) on delete cascade,
  slip_image_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_slips_delivery_id on delivery_slips (delivery_id);

-- updated_at を自動更新
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_deliveries_updated_at on deliveries;
create trigger trg_deliveries_updated_at
  before update on deliveries
  for each row
  execute function set_updated_at();

-- service_role キー経由のみアクセスする運用のため RLS は無効のままにする
-- （API は必ずサーバー側の Supabase service role 経由でのみ呼ばれる）
