import { Router } from 'express';
import { db } from '../db';
import { checkJwt, requireOrg, getTokenClaims, requireReadUsers, requireCreateUsers, requireUpdateUsers, requireDeleteUsers } from '../middleware/auth';

export const usersRouter = Router();

usersRouter.use(checkJwt, requireOrg);

// 同じOrg内の全ユーザー一覧
usersRouter.get('/', requireReadUsers, async (req, res) => {
  const { orgId } = getTokenClaims(req);
  const { rows } = await db.query(
    'SELECT id, org_id, name, given_name, family_name, email, email_verified, picture, last_login_at, created_at, updated_at FROM users WHERE org_id = $1 ORDER BY name',
    [orgId],
  );
  res.json(rows);
});

// 特定ユーザーの取得
usersRouter.get('/:id', requireReadUsers, async (req, res) => {
  const { orgId } = getTokenClaims(req);
  const { rows } = await db.query(
    'SELECT id, org_id, name, given_name, family_name, email, email_verified, picture, last_login_at, created_at, updated_at FROM users WHERE id = $1 AND org_id = $2',
    [req.params.id, orgId],
  );
  if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

// 新規ユーザー登録（INSERT）
usersRouter.post('/', requireCreateUsers, async (req, res) => {
  const { userId, orgId } = getTokenClaims(req);
  const { name, given_name, family_name, email, email_verified, picture } = req.body;

  const { rows } = await db.query(
    `INSERT INTO users (id, org_id, name, given_name, family_name, email, email_verified, picture, last_login_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
     RETURNING id, org_id, name, given_name, family_name, email, email_verified, picture, last_login_at, created_at, updated_at`,
    [
      userId,
      orgId,
      name          ?? null,
      given_name    ?? null,
      family_name   ?? null,
      email         ?? null,
      email_verified ?? false,
      picture       ?? null,
    ],
  );

  res.status(201).json(rows[0]);
});

// ユーザー情報更新（UPDATE）
usersRouter.patch('/:id', requireUpdateUsers, async (req, res) => {
  const { userId, orgId } = getTokenClaims(req);

  // 自分自身のレコードのみ更新可能
  if (req.params.id !== userId) {
    res.status(403).json({ error: 'Cannot update another user' });
    return;
  }

  const { name, given_name, family_name, email, email_verified, picture } = req.body;

  const { rows } = await db.query(
    `UPDATE users
     SET name = $1, given_name = $2, family_name = $3, email = $4, email_verified = $5, picture = $6, last_login_at = NOW(), updated_at = NOW()
     WHERE id = $7 AND org_id = $8
     RETURNING id, org_id, name, given_name, family_name, email, email_verified, picture, last_login_at, created_at, updated_at`,
    [
      name          ?? null,
      given_name    ?? null,
      family_name   ?? null,
      email         ?? null,
      email_verified ?? false,
      picture       ?? null,
      userId,
      orgId,
    ],
  );

  if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

// ユーザー削除
usersRouter.delete('/:id', requireDeleteUsers, async (req, res) => {
  const { orgId } = getTokenClaims(req);
  const { rowCount } = await db.query(
    'DELETE FROM users WHERE id = $1 AND org_id = $2',
    [req.params.id, orgId],
  );
  if (rowCount === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.status(204).end();
});
