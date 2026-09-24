import { NextRequest, NextResponse } from 'next/server';
import { requireEditRole, isCronRequest } from '@/lib/auth';
import { notionEnabled } from '@/lib/notion';
import { runNotionSync } from '@/lib/notionSync';

export const maxDuration = 60;

// 1回の呼び出しで使う時間。Vercel では短め、Docker では環境変数で長くできる。
const BUDGET = Number(process.env.NOTION_SYNC_BUDGET_MS) || 8000;

async function handle(req: NextRequest, loop: boolean) {
  if (!isCronRequest(req)) {
    const denied = await requireEditRole(req);
    if (denied) return denied;
  }
  if (!notionEnabled()) {
    return NextResponse.json({ error: 'Notion 連携が未設定です（NOTION_TOKEN を設定してください）' }, { status: 400 });
  }
  try {
    // 定期実行は1回の呼び出し内で、時間の許す限り続きを進める
    let r = await runNotionSync(BUDGET);
    const start = Date.now();
    while (loop && !r.done && Date.now() - start < 40_000) r = await runNotionSync(BUDGET);
    return NextResponse.json(r);
  } catch (e) {
    console.error('[notion] 同期失敗', e);
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}

// 手動ボタン：1区切りずつ返す（画面側が done になるまで繰り返し呼ぶ）
export async function POST(req: NextRequest) { return handle(req, false); }
// 定期実行（Vercel Cron は GET で呼ぶ）
export async function GET(req: NextRequest) { return handle(req, true); }
