import { Request, Response, NextFunction } from 'express';
import { auth, requiredScopes, InsufficientScopeError, InvalidTokenError, UnauthorizedError } from 'express-oauth2-jwt-bearer';
import { config } from '../config';

/**
 * Auth0 の JWKS エンドポイントから公開鍵を取得して JWT を検証するミドルウェア。
 * - issuer（AUTH0_ISSUER_BASE_URL）を検証
 * - audience（AUTH0_AUDIENCE）を検証
 * - 署名を RS256 公開鍵で検証
 */
export const checkJwt = auth({
  audience: config.auth0.audience,
  issuerBaseURL: config.auth0.issuerBaseURL,
  tokenSigningAlg: 'RS256',
});

/**
 * アクセストークンに org_id クレームが存在することを確認する。
 * Auth0 Organizations でログインしていない場合は 403 を返す。
 */
export const requireOrg = (req: Request, res: Response, next: NextFunction): void => {
  const orgId = req.auth?.payload?.org_id;
  if (!orgId || typeof orgId !== 'string') {
    res.status(403).json({ error: 'Organization context required' });
    return;
  }
  next();
};

/** トークンの sub（user_id）と org_id を返すヘルパー */
export const getTokenClaims = (req: Request) => ({
  userId: req.auth?.payload?.sub as string,
  orgId:  req.auth?.payload?.org_id as string,
});

export const requireReadAccounts   = requiredScopes('read:accounts');
export const requireCreateAccounts = requiredScopes('create:accounts');
export const requireUpdateAccounts = requiredScopes('update:accounts');
export const requireDeleteAccounts = requiredScopes('delete:accounts');

/** Express エラーハンドラー（JWT エラーを整形） */
export const jwtErrorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (err instanceof InvalidTokenError)     { res.status(401).json({ error: 'Invalid token' });       return; }
  if (err instanceof UnauthorizedError)     { res.status(401).json({ error: 'Unauthorized' });         return; }
  if (err instanceof InsufficientScopeError){ res.status(403).json({ error: 'Insufficient scope' });  return; }
  next(err);
};
