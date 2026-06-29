import { Request, Response, NextFunction } from 'express';
import { auth, requiredScopes, InsufficientScopeError, InvalidTokenError, UnauthorizedError } from 'express-oauth2-jwt-bearer';
import { config } from '../config';

export const checkJwt = auth({
  audience: config.auth0.audience,
  issuerBaseURL: config.auth0.issuerBaseURL,
  tokenSigningAlg: 'RS256',
});

export const requireOrg = (req: Request, res: Response, next: NextFunction): void => {
  const orgId = req.auth?.payload?.org_id;
  if (!orgId || typeof orgId !== 'string') {
    res.status(403).json({ error: 'Organization context required' });
    return;
  }
  next();
};

export const getTokenClaims = (req: Request) => ({
  userId: req.auth?.payload?.sub as string,
  orgId:  req.auth?.payload?.org_id as string,
});

export const requireReadOpportunities   = requiredScopes('read:opportunities');
export const requireCreateOpportunities = requiredScopes('create:opportunities');
export const requireUpdateOpportunities = requiredScopes('update:opportunities');
export const requireDeleteOpportunities = requiredScopes('delete:opportunities');

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
