import { NextResponse } from 'next/server';
import { getSupabase, Delivery } from '@/lib/supabase';
import { isMissingColumnError } from '@/lib/dbErrors';

// 全予定をCSVで書き出す（バックアップ・引き継ぎ用）。
// ExcelでそのままひらけるようUTF-8 BOM付き。
//
// 注意点（過去に件数が合わなかった原因への対策）:
//  - 取得は既定で最大1000件で打ち切られるため、削除済みが大量に溜まっていると
//    新しい行がこぼれ落ちる。→ ページングで全件取得する。
//  - 論理削除済み（deleted=true）は画面に出ないので、CSVでも除外して件数を一致させる。
export async function GET() {
  try {
    const supabase = getSupabase();
    const PAGE = 1000;

    // 削除済みを除外して全件をページングで取得。deleted 列が無い環境では条件を外す。
    async function fetchAll(excludeDeleted: boolean): Promise<{ rows: Delivery[]; error: { code?: string; message?: string } | null }> {
      const rows: Delivery[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = supabase
          .from('deliveries')
          .select('*')
          .order('delivery_date', { ascending: true })
          .order('delivery_time', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true }) // ページ跨ぎで並びを安定させる
          .range(from, from + PAGE - 1);
        if (excludeDeleted) q = q.eq('deleted', false);
        const { data, error } = await q as { data: Delivery[] | null; error: { code?: string; message?: string } | null };
        if (error) return { rows, error };
        const batch = data ?? [];
        rows.push(...batch);
        if (batch.length < PAGE) break;
      }
      return { rows, error: null };
    }

    let { rows, error } = await fetchAll(true);
    if (error && isMissingColumnError(error)) ({ rows, error } = await fetchAll(false));
    if (error) throw error;

    const headers = ['納入予定日', '納入予定時刻', '物件名', '品目', '内容・規格', '業者名', '降し場所', '保管場所', '数量', '単位', '発注番号', '備考', 'ステータス', '一部納入', '納入確認時刻', '追加者', '荷下ろし者'];
    // 改行(CR/LF)・カンマ・引用符を含む値は必ずクォートする（Excelで行がずれるのを防ぐ）。
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    for (const d of rows) {
      lines.push([
        d.delivery_date, d.delivery_time, d.project_name, d.item, d.specification,
        d.vendor, d.unload_location, d.storage_location, d.quantity, d.unit, d.order_number,
        d.notes, d.status, d.is_partial ? '一部納入' : '', d.delivered_at, d.created_by, d.unloaded_by,
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
