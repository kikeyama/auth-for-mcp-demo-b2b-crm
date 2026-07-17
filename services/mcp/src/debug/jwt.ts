export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
}

// 署名検証はしない。表示専用（検証済みトークンをデコードするだけ）。
export function decodeJwt(token: string): DecodedJwt | null {
  try {
    const [headerB64, payloadB64] = token.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    return { header, payload };
  } catch {
    return null;
  }
}
