import { NextResponse } from 'next/server';
import { getSupabase, Delivery } from '@/lib/supabase';

// 全予定をCSVで書き出す（バックアップ・引き継ぎ用）。
// ExcelでそのままひらけるようUTF-8 BOM付き。
export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('deliveries')
      .select('*')
      .order('delivery_date', { ascending: true })
      .order('delivery_time', { ascending: true, nullsFirst: false });
    if (error) throw error;

    const rows = (data ?? []) as Delivery[];
    const headers = ['納入予定日', '納入予定時刻', '物件名', '品目', '内容・規格', '業者名', '降し場所', '数量', '単位', '備考', 'ステータス', '納入確認時刻', '追加者'];
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    for (const d of rows) {
      lines.push([
        d.delivery_date, d.delivery_time, d.project_name, d.item, d.specification,
        d.vendor, d.unload_location, d.quantity, d.unit, d.notes, d.status, d.delivered_at, d.created_by,
      ].map(esc).join(','));
    }
    const csv = '﻿' + lines.join('\r\n');

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="nouhin_${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
