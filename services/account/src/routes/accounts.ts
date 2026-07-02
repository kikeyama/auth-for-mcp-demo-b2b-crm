import { Router, Request, Response } from 'express';
import { createId } from '@paralleldrive/cuid2';
import { db } from '../db';
import {
  checkJwt,
  requireOrg,
  requireReadAccounts,
  requireCreateAccounts,
  requireUpdateAccounts,
  requireDeleteAccounts,
  getTokenClaims,
} from '../middleware/auth';

const router = Router();

// すべてのルートに JWT 検証と org 必須チェックを適用
router.use(checkJwt, requireOrg);

/** GET /accounts — org に属するすべての顧客企業を返す */
router.get('/', requireReadAccounts, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  try {
    const { rows } = await db.query(
      `SELECT * FROM accounts WHERE org_id = $1 ORDER BY name ASC`,
      [orgId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /accounts/:id */
router.get('/:id', requireReadAccounts, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  try {
    const { rows } = await db.query(
      `SELECT * FROM accounts WHERE id = $1 AND org_id = $2`,
      [req.params.id, orgId],
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Account not found' }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /accounts */
router.post('/', requireCreateAccounts, async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = getTokenClaims(req);
  const { name, industry, website, phone, address, city, country, employee_count, annual_revenue, owner_id } = req.body;

  if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }

  try {
    const { rows } = await db.query(
      `INSERT INTO accounts
         (id, org_id, name, industry, website, phone, address, city, country, employee_count, annual_revenue, owner_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [createId(), orgId, name, industry ?? null, website ?? null, phone ?? null,
       address ?? null, city ?? null, country ?? null,
       employee_count ?? null, annual_revenue ?? null, owner_id ?? userId, userId],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** PATCH /accounts/:id — 部分更新 */
router.patch('/:id', requireUpdateAccounts, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  const fields = ['name', 'industry', 'website', 'phone', 'address', 'city', 'country', 'employee_count', 'annual_revenue', 'owner_id'];
  const updates: string[] = [];
  const values: unknown[] = [];

  fields.forEach((f) => {
    if (f in req.body) {
      updates.push(`${f} = $${values.length + 1}`);
      values.push(req.body[f]);
    }
  });

  if (updates.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(req.params.id, orgId);
  try {
    const { rows } = await db.query(
      `UPDATE accounts SET ${updates.join(', ')} WHERE id = $${values.length - 1} AND org_id = $${values.length} RETURNING *`,
      values,
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Account not found' }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** DELETE /accounts/:id */
router.delete('/:id', requireDeleteAccounts, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  try {
    const { rowCount } = await db.query(
      `DELETE FROM accounts WHERE id = $1 AND org_id = $2`,
      [req.params.id, orgId],
    );
    if (!rowCount) { res.status(404).json({ error: 'Account not found' }); return; }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as accountsRouter };
