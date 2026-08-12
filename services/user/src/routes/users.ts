import { Router } from 'express';
import { db } from '../db';
import {
  checkJwt, requireOrg, requireOrgOrTrustedSyncClient, getTokenClaims, isTrustedSyncClient, requireTrustedSyncClient,
  requireReadUsers, requireCreateUsers, requireUpdateUsers, requireDeleteUsers,
} from '../middleware/auth';
import { UNASSIGNED_ORG_ID } from '../constants';

const USER_COLUMNS = 'id, org_id, name, given_name, family_name, email, email_verified, picture, blocked, last_login_at, created_at, updated_at';

export const usersRouter = Router();

usersRouter.use(checkJwt);

// 同じOrg内の全ユーザー一覧
usersRouter.get('/', requireOrg, requireReadUsers, async (req, res) => {
  const { orgId } = getTokenClaims(req);
  const { rows } = await db.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE org_id = $1 ORDER BY name`,
    [orgId],
  );
  res.json(rows);
});

// 特定ユーザーの取得。
// user.updated/user.deleted はイベントペイロードにorg_idが無いため、信頼済み同期クライアントは
// org無しトークンで呼べる（この場合のみorg_idフィルタを外す）。
usersRouter.get('/:id', requireOrgOrTrustedSyncClient, requireReadUsers, async (req, res) => {
  const trusted = isTrustedSyncClient(req);
  const { orgId } = getTokenClaims(req);
  const { rows } = await db.query(
    trusted
      ? `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`
      : `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND org_id = $2`,
    trusted ? [req.params.id] : [req.params.id, orgId],
  );
  if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

// 新規ユーザー登録（INSERT）
usersRouter.post('/', requireOrg, requireCreateUsers, async (req, res) => {
  const { userId, orgId } = getTokenClaims(req);
  const { name, given_name, family_name, email, email_verified, picture } = req.body;

  const { rows } = await db.query(
    `INSERT INTO users (id, org_id, name, given_name, family_name, email, email_verified, picture, last_login_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
     RETURNING ${USER_COLUMNS}`,
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

// ユーザー情報更新（UPDATE）。
// user.updated/user.deleted はイベントペイロードにorg_idが無いため、信頼済み同期クライアントは
// org無しトークンで呼べる（この場合のみ本人チェック・org_idフィルタを外す）。
usersRouter.patch('/:id', requireOrgOrTrustedSyncClient, requireUpdateUsers, async (req, res) => {
  const trusted = isTrustedSyncClient(req);
  const { userId, orgId } = getTokenClaims(req);

  // 自分自身のレコードのみ更新可能（auth0events からの信頼済み同期リクエストのみ例外）
  if (req.params.id !== userId && !trusted) {
    res.status(403).json({ error: 'Cannot update another user' });
    return;
  }

  const { name, given_name, family_name, email, email_verified, picture, blocked } = req.body;

  const { rows } = await db.query(
    trusted
      ? `UPDATE users
         SET name = $1, given_name = $2, family_name = $3, email = $4, email_verified = $5, picture = $6, blocked = $7, updated_at = NOW()
         WHERE id = $8
         RETURNING ${USER_COLUMNS}`
      : `UPDATE users
         SET name = $1, given_name = $2, family_name = $3, email = $4, email_verified = $5, picture = $6, blocked = $7, updated_at = NOW()
         WHERE id = $8 AND org_id = $9
         RETURNING ${USER_COLUMNS}`,
    trusted
      ? [name ?? null, given_name ?? null, family_name ?? null, email ?? null, email_verified ?? false, picture ?? null, blocked ?? false, req.params.id]
      : [name ?? null, given_name ?? null, family_name ?? null, email ?? null, email_verified ?? false, picture ?? null, blocked ?? false, req.params.id, orgId],
  );

  if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

// org割当（未割当プレースホルダー行 → 実org への一方向遷移のみ許可）
usersRouter.patch('/:id/org', requireOrg, requireUpdateUsers, async (req, res) => {
  const { orgId } = getTokenClaims(req);

  const { rows } = await db.query(
    `UPDATE users SET org_id = $1, updated_at = NOW()
     WHERE id = $2 AND org_id = $3
     RETURNING ${USER_COLUMNS}`,
    [orgId, req.params.id, UNASSIGNED_ORG_ID],
  );

  if (rows.length === 0) { res.status(404).json({ error: 'Not found or already assigned' }); return; }
  res.json(rows[0]);
});

// ユーザー削除
usersRouter.delete('/:id', requireOrg, requireDeleteUsers, async (req, res) => {
  const { orgId } = getTokenClaims(req);
  const { rowCount } = await db.query(
    'DELETE FROM users WHERE id = $1 AND org_id = $2',
    [req.params.id, orgId],
  );
  if (rowCount === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.status(204).end();
});

// user.created 受信時点ではorgがまだ分からないため、requireOrgを適用しない専用ルーター。
// 信頼済み同期クライアント（auth0events）のみが呼べる。
export const usersProvisionalRouter = Router();

usersProvisionalRouter.post('/', checkJwt, requireTrustedSyncClient, requireCreateUsers, async (req, res) => {
  const { id, name, given_name, family_name, email, email_verified, picture, blocked } = req.body;

  // user.created のペイロードには email_verified が含まれない（実データで確認済み）一方、
  // blocked は含まれる（削除→同じuser_idで再作成された場合に、古い blocked=true を
  // 引き継がずリセットできるようにするため）。リクエストボディに存在しないフィールドは
  // INSERT列・ON CONFLICTのSETどちらからも省き、初回作成時はDBのDEFAULTに、既存行への
  // 上書き時は既存値に委ねる（無いフィールドで既存値を false/null に戻してしまわない
  // ようにするため、動的にSQLを組み立てる）。
  const profileFields: Array<[string, unknown]> = (
    [
      ['name', name], ['given_name', given_name], ['family_name', family_name],
      ['email', email], ['email_verified', email_verified], ['picture', picture],
      ['blocked', blocked],
    ] as Array<[string, unknown]>
  ).filter(([, v]) => v !== undefined);

  const insertCols = ['id', 'org_id', ...profileFields.map(([col]) => col), 'last_login_at', 'created_at', 'updated_at'];
  const insertVals = [id, UNASSIGNED_ORG_ID, ...profileFields.map(([, v]) => v)];
  const insertPlaceholders = [...insertVals.map((_, i) => `$${i + 1}`), 'NOW()', 'NOW()', 'NOW()'];
  const updateSet = [...profileFields.map(([col]) => `${col} = EXCLUDED.${col}`), 'updated_at = NOW()'].join(', ');

  const { rows } = await db.query(
    `INSERT INTO users (${insertCols.join(', ')})
     VALUES (${insertPlaceholders.join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${updateSet}
     RETURNING ${USER_COLUMNS}`,
    insertVals,
  );

  res.status(201).json(rows[0]);
});
