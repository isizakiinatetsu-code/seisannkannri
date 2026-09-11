// 現寸発注チェックシートの「標準テンプレート（全項目）」と、
// 納入システムのデータ（品目・内容規格・備考）から各項目へ自動でひも付ける仕組み。
// フェーズ1：既存の納入データを読み取って自動反映する（DB追加なし）。
// キーワード対応は実データに合わせて随時強化する前提の“たたき台”。

export interface ChkItem { label: string; kw?: string[] }   // kw省略時はlabelをそのまま使う
export interface ChkGroup { group: string; items: ChkItem[] }
export interface ChkSection { section: string; groups: ChkGroup[] }

export const CHECKLIST: ChkSection[] = [
  { section: '仮設材', groups: [
    { group: 'ネットフック', items: [
      { label: '大梁付き', kw: ['ネットフック'] }, { label: '小梁付き', kw: ['ネットフック'] }, { label: '柱ブラケット付き', kw: ['ネットフック'] } ] },
    { group: '吊りピース', items: [ { label: '柱付き', kw: ['吊りピース', '吊ピース', '吊りピ', '吊ピ'] }, { label: '大梁付き', kw: ['吊りピース', '吊ピース', '吊りピ', '吊ピ'] } ] },
    { group: '親綱ピース', items: [ { label: '柱付き', kw: ['親綱'] } ] },
    { group: '建起こしピース', items: [ { label: '柱付き', kw: ['建起こし', '建て起こし', '建起'] } ] },
    { group: 'サヤ管', items: [ { label: '柱付き', kw: ['サヤ管', 'さや管'] }, { label: '大梁付き', kw: ['サヤ管', 'さや管'] }, { label: '小梁付き', kw: ['サヤ管', 'さや管'] } ] },
    { group: 'タラップ', items: [ { label: '柱付き', kw: ['タラップ'] } ] },
  ]},
  { section: 'ボルト', groups: [
    { group: 'HTB〈TC / 六角 / メッキ〉', items: [
      { label: '柱J', kw: ['HTB', 'TC', 'S10T', 'F10T', '高力', 'ボルト', 'BOLT'] }, { label: '大梁J', kw: ['HTB', 'TC', 'ボルト', 'BOLT'] },
      { label: '小梁J', kw: ['HTB', 'TC', 'ボルト', 'BOLT'] }, { label: '間柱J', kw: ['HTB', 'TC'] }, { label: 'ブレースJ', kw: ['HTB'] },
      { label: '階段J', kw: ['HTB'] }, { label: 'その他', kw: [] } ] },
    { group: 'D-LOCK〈どぶメッキ〉', items: [ { label: '胴縁', kw: ['D-LOCK', 'Dロック', 'ロックボルト', 'どぶ'] }, { label: '母屋', kw: ['D-LOCK', 'Dロック'] }, { label: 'その他', kw: [] } ] },
  ]},
  { section: '二次部材', groups: [
    { group: 'スリーブ補強材', items: [ { label: 'OSリング', kw: ['OSリング', 'ＯＳリング'] }, { label: 'ハイリング', kw: ['ハイリング'] }, { label: 'フリードーナツ', kw: ['ドーナツ', 'フリードーナツ'] }, { label: 'プレート', kw: ['スリーブ', '補強プレート'] } ] },
    { group: 'デッキ受け', items: [ { label: 'FB-6x65', kw: ['FB-6x65', 'FB6x65', 'デッキ受け'] }, { label: 'FB-6x32', kw: ['FB-6x32', 'FB6x32'] }, { label: 'FB-6x50', kw: ['FB-6x50', 'FB6x50'] }, { label: 'L材 / [材', kw: ['デッキ受け'] }, { label: 'CT', kw: ['CTデッキ'] }, { label: 'BT', kw: ['BTデッキ'] }, { label: '現場用(継手部)', kw: [] } ] },
    { group: 'タイトフレーム', items: [ { label: 'C-100x50x20x', kw: ['タイトフレーム', 'C-100x50'] }, { label: '現場用(継手部)', kw: [] } ] },
    { group: '胴縁ネコ', items: [ { label: '柱付き', kw: ['胴縁ネコ'] }, { label: '間柱付き', kw: ['胴縁ネコ'] }, { label: '大梁付き', kw: ['胴縁ネコ'] }, { label: '小梁付き(耐風梁)', kw: ['胴縁ネコ', '耐風'] }, { label: '胴縁同士', kw: ['胴縁ネコ'] } ] },
    { group: '母屋ネコ', items: [ { label: '柱付き', kw: ['母屋ネコ'] }, { label: '間柱付き', kw: ['母屋ネコ'] }, { label: '大梁付き', kw: ['母屋ネコ'] }, { label: '小梁付き', kw: ['母屋ネコ'] } ] },
    { group: 'EV', items: [ { label: '三方枠', kw: ['三方枠'] }, { label: '敷居受け', kw: ['敷居'] }, { label: 'ファスナー', kw: ['ファスナー'] } ] },
    { group: '階段', items: [ { label: 'G.PL', kw: ['階段'] }, { label: '手摺取合い', kw: ['手摺', '手すり'] } ] },
    { group: '止水PL', items: [ { label: '柱ブラケット付き', kw: ['止水'] }, { label: '間柱ブラケット付き', kw: ['止水'] }, { label: '大梁付き', kw: ['止水'] }, { label: '小梁付き', kw: ['止水'] } ] },
  ]},
  { section: '鋼板注文', groups: [
    { group: '柱', items: [ { label: 'ダイヤフラム', kw: ['ダイヤフラム', 'ダイアフラム', 'ダイア'] }, { label: '内ダイヤフラム', kw: ['内ダイヤ', '内ダイア'] }, { label: 'ベースプレート', kw: ['ベースプレート', 'ベース', 'ＢＰ'] }, { label: 'ふたプレート(メッキ時)', kw: ['ふたプレート', 'フタプレート'] } ] },
    { group: 'スプライス', items: [ { label: '大梁用', kw: ['スプライス'] }, { label: '小梁用', kw: ['スプライス'] } ] },
    { group: '柱（PL）', items: [ { label: 'G.PL', kw: ['G.PL', 'ガセット'] }, { label: 'リブPL', kw: ['リブ'] }, { label: '胴縁取り合い', kw: ['胴縁取り合い', '胴縁取合'] }, { label: 'エレクションピース', kw: ['エレクションピース', 'エレクション', 'エレピ'] } ] },
    { group: 'ブラケット', items: [ { label: 'G.PL', kw: ['ブラケット'] }, { label: 'リブPL', kw: ['ブラケット', 'リブ'] }, { label: '胴縁取り合い', kw: [] } ] },
    { group: '大梁', items: [ { label: 'G.PL', kw: ['大梁'] }, { label: 'リブPL', kw: ['大梁', 'リブ'] }, { label: '胴縁取り合い', kw: [] } ] },
    { group: '小梁', items: [ { label: 'G.PL', kw: ['小梁'] }, { label: 'リブPL', kw: ['小梁', 'リブ'] }, { label: '胴縁取り合い', kw: [] } ] },
    { group: '間柱', items: [ { label: 'G.PL', kw: ['間柱'] }, { label: 'リブPL', kw: ['間柱', 'リブ'] }, { label: '胴縁取り合い', kw: [] }, { label: 'ベースプレート', kw: ['間柱', 'ベース'] } ] },
    { group: 'ブレース', items: [ { label: 'G.PL', kw: ['ブレース'] }, { label: 'かめPL', kw: ['かめ'] }, { label: '既製品ブレースシート', kw: ['ブレースシート', '既製品ブレース'] } ] },
  ]},
  { section: '鋼材注文', groups: [
    { group: 'コラム柱', items: [ { label: 'コラム(シャフト・コア)', kw: ['コラム', 'シャフト', 'コア', '□-', 'BOX', '角形'] }, { label: '裏当て金', kw: ['裏当', '裏当て'] } ] },
    { group: 'H柱', items: [ { label: 'H型鋼(シャフト・コア)', kw: ['H型鋼', 'H形鋼', 'H-'] }, { label: '裏当て金', kw: ['裏当', '裏当て'] } ] },
    { group: 'ブラケット', items: [ { label: '仕口', kw: ['仕口'] }, { label: '大梁付き', kw: ['ブラケット', '大梁付'] }, { label: '小梁付き', kw: ['ブラケット', '小梁付'] }, { label: '間柱付き', kw: ['ブラケット', '間柱付'] }, { label: '裏当て金', kw: ['裏当'] } ] },
    { group: '大梁', items: [ { label: '大梁', kw: ['大梁'] } ] },
    { group: '小梁', items: [ { label: '小梁', kw: ['小梁'] }, { label: '火打ち', kw: ['火打'] }, { label: '方杖', kw: ['方杖'] } ] },
    { group: '間柱', items: [ { label: '間柱', kw: ['間柱'] } ] },
    { group: 'ブレース', items: [ { label: 'RB(T.B付)', kw: ['RB', 'ターンバックル', 'T.B', 'TB付'] }, { label: 'L材', kw: ['L材', 'アングル', 'L-'] }, { label: '[材', kw: ['[材', 'チャンネル', '[-'] } ] },
    { group: '軽量関係', items: [ { label: '胴縁', kw: ['胴縁'] }, { label: '母屋', kw: ['母屋'] }, { label: '根太', kw: ['根太'] }, { label: 'その他', kw: [] } ] },
  ]},
];

export type ItemStatus = 'done' | 'ordered' | 'none' | 'na'; // 納入済み / 発注済み(予定あり) / 未手配 / 対象外

export interface DeliveryLite {
  id: number; item: string; specification: string | null; notes: string | null;
  vendor: string; delivery_date: string; status: string; unload_location?: string | null;
}
export interface ReconciledItem { key: string; label: string; status: ItemStatus; info: string }
export interface ReconciledGroup { group: string; items: ReconciledItem[] }
export interface ReconciledSection { section: string; groups: ReconciledGroup[]; done: number; ordered: number; none: number; na: number }
export interface Reconciled {
  sections: ReconciledSection[];
  summary: { done: number; ordered: number; none: number; na: number; total: number; matchedDeliveries: number };
  ready: { date: string | null; pending: number; allDelivered: boolean };
  unmatched: { item: string; specification: string | null; vendor: string; delivery_date: string; status: string }[];
}

// 項目を一意に識別するキー（対象外設定の保存に使う）
export const itemKey = (section: string, group: string, label: string) => `${section}|${group}|${label}`;

const jpDate = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? `${Number(m[2])}/${Number(m[3])}` : d; };

// 納入データ配列を現寸チェックテンプレートに反映する。excluded=対象外にした項目キーの集合。
export function reconcile(dels: DeliveryLite[], excluded?: Set<string>): Reconciled {
  const rows = dels.map(d => ({ ...d, hay: `${d.item ?? ''} ${d.specification ?? ''} ${d.notes ?? ''}` }));
  const used = new Set<number>();
  const ex = excluded ?? new Set<string>();

  const sections: ReconciledSection[] = CHECKLIST.map(sec => {
    let sDone = 0, sOrd = 0, sNone = 0, sNa = 0;
    const groups: ReconciledGroup[] = sec.groups.map(g => ({
      group: g.group,
      items: g.items.map(it => {
        const key = itemKey(sec.section, g.group, it.label);
        const kws = it.kw && it.kw.length ? it.kw : [];
        const matches = kws.length ? rows.filter(r => kws.some(k => r.hay.includes(k))) : [];
        let status: ItemStatus = 'none'; let info = '';
        if (matches.length) {
          const done = matches.find(m => m.status === '納入済み');
          const chosen = done ?? matches.slice().sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))[0];
          status = done ? 'done' : 'ordered';
          info = done ? `${chosen.vendor}・${jpDate(chosen.delivery_date)} 納入` : `${chosen.vendor}・予定 ${jpDate(chosen.delivery_date)}`;
          matches.forEach(m => used.add(m.id));
        }
        // 対象外は、一致が無い（未手配）項目にのみ適用する（発注/納入がある項目は実績を優先）
        if (status === 'none' && ex.has(key)) status = 'na';
        if (status === 'done') sDone++; else if (status === 'ordered') sOrd++; else if (status === 'na') sNa++; else sNone++;
        return { key, label: it.label, status, info };
      }),
    }));
    return { section: sec.section, groups, done: sDone, ordered: sOrd, none: sNone, na: sNa };
  });

  const done = sections.reduce((s, x) => s + x.done, 0);
  const ordered = sections.reduce((s, x) => s + x.ordered, 0);
  const none = sections.reduce((s, x) => s + x.none, 0);
  const na = sections.reduce((s, x) => s + x.na, 0);

  // 揃う日：未納入(予定)の中で最も遅い納入予定日。全部納入済みなら最後の納入日。
  const pending = rows.filter(r => r.status !== '納入済み');
  const allDelivered = rows.length > 0 && pending.length === 0;
  let readyDate: string | null = null;
  if (rows.length > 0) {
    const pool = pending.length ? pending : rows;
    readyDate = pool.reduce((mx, r) => (r.delivery_date > mx ? r.delivery_date : mx), pool[0].delivery_date);
  }

  const unmatched = rows.filter(r => !used.has(r.id)).map(r => ({
    item: r.item, specification: r.specification, vendor: r.vendor, delivery_date: r.delivery_date, status: r.status,
  }));

  return {
    sections,
    summary: { done, ordered, none, na, total: done + ordered + none + na, matchedDeliveries: used.size },
    ready: { date: readyDate, pending: pending.length, allDelivered },
    unmatched,
  };
}
