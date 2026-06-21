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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deliveries_delivery_date on deliveries (delivery_date);
create index if not exists idx_deliveries_status on deliveries (status);

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
