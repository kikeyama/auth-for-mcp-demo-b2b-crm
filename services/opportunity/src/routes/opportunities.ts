import { Router, Request, Response } from 'express';
import { createId } from '@paralleldrive/cuid2';
import { db } from '../db';
import {
  checkJwt,
  requireOrg,
  requireReadOpportunities,
  requireCreateOpportunities,
  requireUpdateOpportunities,
  requireDeleteOpportunities,
  getTokenClaims,
} from '../middleware/auth';

const VALID_STAGES = ['prospect', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

const TRACKED_FIELDS = ['name', 'account_id', 'stage', 'amount', 'expected_close_date', 'probability', 'description'] as const;
type TrackedField = typeof TRACKED_FIELDS[number];

type HistoryEntry = { field: TrackedField; oldValue: string | null; newValue: string | null };

async function insertHistory(
  opportunityId: string,
  orgId: string,
  changedBy: string,
  action: 'created' | 'updated',
  entries: HistoryEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  const rows = entries.map(e => [
    createId(), opportunityId, orgId, changedBy, action, e.field, e.oldValue, e.newValue,
  ]);
  const placeholders = rows.map((_, i) =>
    `($${i * 8 + 1},$${i * 8 + 2},$${i * 8 + 3},$${i * 8 + 4},$${i * 8 + 5},$${i * 8 + 6},$${i * 8 + 7},$${i * 8 + 8})`
  ).join(', ');
  await db.query(
    `INSERT INTO opportunity_history (id, opportunity_id, org_id, changed_by, action, field_name, old_value, new_value)
     VALUES ${placeholders}`,
    rows.flat(),
  );
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

const router = Router();
router.use(checkJwt, requireOrg);

/** GET /opportunities?account_id=xxx */
router.get('/', requireReadOpportunities, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  const { account_id } = req.query;

  try {
    const params: unknown[] = [orgId];
    let sql = `SELECT o.*, a.name AS account_name FROM opportunities o
               LEFT JOIN accounts a ON a.id = o.account_id
               WHERE o.org_id = $1`;
    if (account_id) { sql += ` AND o.account_id = $${params.push(account_id)}`; }
    sql += ` ORDER BY o.created_at DESC`;

    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /opportunities/:id/history */
router.get('/:id/history', requireReadOpportunities, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  try {
    const { rows } = await db.query(
      `SELECT h.*,
         old_a.name AS old_account_name,
         new_a.name AS new_account_name
       FROM opportunity_history h
       LEFT JOIN accounts old_a ON h.field_name = 'account_id' AND old_a.id = h.old_value
       LEFT JOIN accounts new_a ON h.field_name = 'account_id' AND new_a.id = h.new_value
       WHERE h.opportunity_id = $1 AND h.org_id = $2
       ORDER BY h.changed_at DESC, h.id ASC`,
      [req.params.id, orgId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /opportunities/:id */
router.get('/:id', requireReadOpportunities, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  try {
    const { rows } = await db.query(
      `SELECT o.*, a.name AS account_name FROM opportunities o
       LEFT JOIN accounts a ON a.id = o.account_id
       WHERE o.id = $1 AND o.org_id = $2`,
      [req.params.id, orgId],
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Opportunity not found' }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /opportunities */
router.post('/', requireCreateOpportunities, async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = getTokenClaims(req);
  const { name, account_id, stage, amount, expected_close_date, probability, owner_id, description } = req.body;

  if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
  if (stage && !VALID_STAGES.includes(stage)) {
    res.status(400).json({ error: `stage must be one of: ${VALID_STAGES.join(', ')}` }); return;
  }

  if (account_id) {
    const { rowCount } = await db.query(
      `SELECT 1 FROM accounts WHERE id = $1 AND org_id = $2`, [account_id, orgId],
    );
    if (!rowCount) { res.status(400).json({ error: 'Account not found in organization' }); return; }
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO opportunities
         (id, org_id, account_id, name, stage, amount, expected_close_date, probability, owner_id, description, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [createId(), orgId, account_id ?? null, name, stage ?? 'prospect', amount ?? null,
       expected_close_date ?? null, probability ?? null, owner_id ?? userId, description ?? null, userId],
    );
    const opp = rows[0];

    const entries: HistoryEntry[] = TRACKED_FIELDS
      .filter(f => opp[f] != null)
      .map(f => ({ field: f, oldValue: null, newValue: toStr(opp[f]) }));
    await insertHistory(opp.id, orgId, userId, 'created', entries);

    res.status(201).json(opp);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** PATCH /opportunities/:id */
router.patch('/:id', requireUpdateOpportunities, async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = getTokenClaims(req);
  const fields = ['name', 'account_id', 'stage', 'amount', 'expected_close_date', 'probability', 'owner_id', 'description'];
  const updates: string[] = [];
  const values: unknown[] = [];

  if (req.body.stage && !VALID_STAGES.includes(req.body.stage)) {
    res.status(400).json({ error: `stage must be one of: ${VALID_STAGES.join(', ')}` }); return;
  }

  fields.forEach((f) => {
    if (f in req.body) {
      updates.push(`${f} = $${values.length + 1}`);
      values.push(req.body[f]);
    }
  });

  if (updates.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  try {
    const { rows: beforeRows } = await db.query(
      `SELECT * FROM opportunities WHERE id = $1 AND org_id = $2`,
      [req.params.id, orgId],
    );
    if (beforeRows.length === 0) { res.status(404).json({ error: 'Opportunity not found' }); return; }
    const before = beforeRows[0];

    values.push(req.params.id, orgId);
    const { rows } = await db.query(
      `UPDATE opportunities SET ${updates.join(', ')} WHERE id = $${values.length - 1} AND org_id = $${values.length} RETURNING *`,
      values,
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Opportunity not found' }); return; }
    const after = rows[0];

    const entries: HistoryEntry[] = TRACKED_FIELDS
      .filter(f => f in req.body)
      .filter(f => toStr(before[f]) !== toStr(after[f]))
      .map(f => ({ field: f, oldValue: toStr(before[f]), newValue: toStr(after[f]) }));
    await insertHistory(req.params.id, orgId, userId, 'updated', entries);

    res.json(after);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** DELETE /opportunities/:id */
router.delete('/:id', requireDeleteOpportunities, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  try {
    const { rowCount } = await db.query(
      `DELETE FROM opportunities WHERE id = $1 AND org_id = $2`, [req.params.id, orgId],
    );
    if (!rowCount) { res.status(404).json({ error: 'Opportunity not found' }); return; }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as opportunitiesRouter };
