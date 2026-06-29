import { Router, Request, Response } from 'express';
import { createId } from '@paralleldrive/cuid2';
import { db } from '../db';
import {
  checkJwt,
  requireOrg,
  requireReadContacts,
  requireCreateContacts,
  requireUpdateContacts,
  requireDeleteContacts,
  getTokenClaims,
} from '../middleware/auth';

const router = Router();
router.use(checkJwt, requireOrg);

/** GET /contacts?account_id=xxx */
router.get('/', requireReadContacts, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  const { account_id } = req.query;

  try {
    const params: unknown[] = [orgId];
    let sql = `SELECT c.*, a.name AS account_name FROM contacts c
               LEFT JOIN accounts a ON a.id = c.account_id
               WHERE c.org_id = $1`;
    if (account_id) { sql += ` AND c.account_id = $${params.push(account_id)}`; }
    sql += ` ORDER BY c.last_name ASC, c.first_name ASC`;

    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /contacts/:id */
router.get('/:id', requireReadContacts, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  try {
    const { rows } = await db.query(
      `SELECT c.*, a.name AS account_name FROM contacts c
       LEFT JOIN accounts a ON a.id = c.account_id
       WHERE c.id = $1 AND c.org_id = $2`,
      [req.params.id, orgId],
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Contact not found' }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /contacts */
router.post('/', requireCreateContacts, async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = getTokenClaims(req);
  const { first_name, last_name, account_id, email, phone, title, department } = req.body;

  if (!first_name?.trim() || !last_name?.trim()) {
    res.status(400).json({ error: 'first_name and last_name are required' }); return;
  }

  if (account_id) {
    const { rowCount } = await db.query(
      `SELECT 1 FROM accounts WHERE id = $1 AND org_id = $2`, [account_id, orgId],
    );
    if (!rowCount) { res.status(400).json({ error: 'Account not found in organization' }); return; }
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO contacts
         (id, org_id, account_id, first_name, last_name, email, phone, title, department, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [createId(), orgId, account_id ?? null, first_name, last_name, email ?? null,
       phone ?? null, title ?? null, department ?? null, userId],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** PATCH /contacts/:id */
router.patch('/:id', requireUpdateContacts, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  const fields = ['first_name', 'last_name', 'account_id', 'email', 'phone', 'title', 'department'];
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
      `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${values.length - 1} AND org_id = $${values.length} RETURNING *`,
      values,
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Contact not found' }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** DELETE /contacts/:id */
router.delete('/:id', requireDeleteContacts, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  try {
    const { rowCount } = await db.query(
      `DELETE FROM contacts WHERE id = $1 AND org_id = $2`, [req.params.id, orgId],
    );
    if (!rowCount) { res.status(404).json({ error: 'Contact not found' }); return; }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as contactsRouter };
