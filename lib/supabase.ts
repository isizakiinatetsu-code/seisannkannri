import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が設定されていません');
    }
    client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return client;
}

export interface Delivery {
  id: number;
  delivery_date: string;
  delivery_time: string | null;
  project_name: string;
  item: string;
  specification: string | null;
  vendor: string;
  unload_location: string;
  storage_location: string | null;
  quantity: number | null;
  unit: string | null;
  order_number: string | null;
  notes: string | null;
  status: '予定' | '納入済み';
  delivered_at: string | null;
  slip_image_path: string | null;
  created_at: string;
  updated_at: string;
}

export type DeliveryInput = Omit<Delivery, 'id' | 'created_at' | 'updated_at'>;

export interface DeliverySlip {
  id: number;
  delivery_id: number;
  slip_image_path: string;
  created_at: string;
}
