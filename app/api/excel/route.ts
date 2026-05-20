import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import * as XLSX from 'xlsx';

function parseDate(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, '0');
      const d = String(date.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  if (typeof val === 'string') {
    // Try YYYY/MM/DD or YYYY-MM-DD
    const cleaned = val.trim().replace(/\//g, '-');
    const match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
    }
  }
  return null;
}

function parseTime(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    const t = val.trim();
    if (/^\d{1,2}:\d{2}/.test(t)) return t.substring(0, 5);
    return t; // e.g. "午前中"
  }
  if (typeof val === 'number' && val > 0 && val < 1) {
    // Excel time fraction
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

    // Try preferred sheets in order; pick the one that has a header row with actual data
    const preferredSheets = ['入荷予定', '記入例', ...workbook.SheetNames];
    const uniqueSheets = [...new Set(preferredSheets)].filter(s => workbook.SheetNames.includes(s));

    let rows: unknown[][] = [];
    let headerRowIdx = -1;

    for (const sheetName of uniqueSheets) {
      const sheet = workbook.Sheets[sheetName];
      const candidate: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
      }) as unknown[][];

      for (let i = 0; i < Math.min(10, candidate.length); i++) {
        const row = candidate[i];
        if (row.some(c => typeof c === 'string' && c.includes('納入予定日'))) {
          // Check if there are data rows after the header
          const hasData = candidate.slice(i + 1).some(r => r && r.some(c => c !== null && c !== ''));
          if (hasData) {
            rows = candidate;
            headerRowIdx = i;
            break;
          }
        }
      }
      if (headerRowIdx !== -1) break;
    }

    if (headerRowIdx === -1) {
      return NextResponse.json({ error: 'ヘッダー行またはデータが見つかりません。「入荷予定」シートにデータを入力してください。' }, { status: 400 });
    }

    // Map column indices from header row
    const headers = rows[headerRowIdx].map(h => (typeof h === 'string' ? h.trim().replace(/★\s*|　/g, '') : ''));
    const colIdx = (name: string) => headers.findIndex(h => h.includes(name));

    const idxDate = colIdx('納入予定日');
    const idxTime = colIdx('納入予定時刻');
    const idxProject = colIdx('物件名');
    const idxItem = colIdx('品目');
    const idxSpec = colIdx('内容・規格');
    const idxVendor = colIdx('業者名');
    const idxUnload = colIdx('降し場所');
    const idxStorage = colIdx('保管場所');
    const idxQty = colIdx('数量');
    const idxUnit = colIdx('単位');
    const idxOrder = colIdx('発注番号');
    const idxNotes = colIdx('備考');

    const db = getDB();
    const insertStmt = db.prepare(`
      INSERT INTO deliveries
        (delivery_date, delivery_time, project_name, item, specification,
         vendor, unload_location, storage_location, quantity, unit,
         order_number, notes, status)
      VALUES
        (@delivery_date, @delivery_time, @project_name, @item, @specification,
         @vendor, @unload_location, @storage_location, @quantity, @unit,
         @order_number, @notes, @status)
    `);

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    const dataRows = rows.slice(headerRowIdx + 1);

    const insertMany = db.transaction((rows: unknown[][]) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every(c => !c)) continue;

        const dateVal = parseDate(row[idxDate]);
        const projectVal = idxProject >= 0 ? String(row[idxProject] ?? '').trim() : '';
        const itemVal = idxItem >= 0 ? String(row[idxItem] ?? '').trim() : '';
        const vendorVal = idxVendor >= 0 ? String(row[idxVendor] ?? '').trim() : '';
        const unloadVal = idxUnload >= 0 ? String(row[idxUnload] ?? '').trim() : '';

        if (!dateVal || !projectVal || !itemVal) {
          skipped++;
          continue;
        }

        try {
          insertStmt.run({
            delivery_date: dateVal,
            delivery_time: idxTime >= 0 ? parseTime(row[idxTime]) : null,
            project_name: projectVal,
            item: itemVal,
            specification: idxSpec >= 0 && row[idxSpec] ? String(row[idxSpec]).trim() : null,
            vendor: vendorVal || '未設定',
            unload_location: unloadVal || '未設定',
            storage_location: idxStorage >= 0 && row[idxStorage] ? String(row[idxStorage]).trim() : null,
            quantity: idxQty >= 0 && row[idxQty] !== null ? Number(row[idxQty]) : null,
            unit: idxUnit >= 0 && row[idxUnit] ? String(row[idxUnit]).trim() : null,
            order_number: idxOrder >= 0 && row[idxOrder] ? String(row[idxOrder]).trim() : null,
            notes: idxNotes >= 0 && row[idxNotes] ? String(row[idxNotes]).trim() : null,
            status: '予定',
          });
          imported++;
        } catch {
          errors.push(`行${i + headerRowIdx + 2}: インポートエラー`);
        }
      }
    });

    insertMany(dataRows);

    return NextResponse.json({ imported, skipped, errors });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: `処理エラー: ${e}` }, { status: 500 });
  }
}
