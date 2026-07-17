// 認証Cookieの署名・検証。
// 以前は cookie の値が "edit"/"view" という平文だったため、誰でも
// Cookie: inatetsu_role=edit を送れば編集権限を得られてしまった（認証の完全バイパス）。
// ここで HMAC 署名を付け、サーバーの秘密鍵で検証することで偽造を防ぐ。
// Web Crypto (crypto.subtle) を使うため、edge(proxy) と node(API) の両方で動く。

export type Role = 'edit' | 'view';

const encoder = new TextEncoder();

function getSecret(): string {
  // 専用の秘密鍵があればそれを使う。無ければパスワードから導出する
  // （新しい環境変数を必須にしないため。パスワード変更時は既存Cookieが無効になる）。
  return (
    process.env.SESSION_SECRET ||
    `${process.env.EDIT_PASSWORD ?? ''}|${process.env.VIEW_PASSWORD ?? ''}|inatetsu-session-v1`
  );
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(msg));
  return base64url(new Uint8Array(sig));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 署名付きトークンを作る： "role.exp.signature"
export async function signSession(role: Role, maxAgeSec: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
  const payload = `${role}.${exp}`;
  const sig = await hmac(payload);
  return `${payload}.${sig}`;
}

// トークンを検証し、正当ならロールを返す。改ざん・期限切れは null。
export async function verifySession(token: string | undefined | null): Promise<Role | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [role, expStr, sig] = parts;
  if (role !== 'edit' && role !== 'view') return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const expected = await hmac(`${role}.${expStr}`);
  if (!timingSafeEqual(sig, expected)) return null;
  return role;
}
