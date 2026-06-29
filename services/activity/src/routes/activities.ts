import { Router, Request, Response } from 'express';
import { createId } from '@paralleldrive/cuid2';
import { db } from '../db';
import {
  checkJwt,
  requireOrg,
  requireReadActivities,
  requireCreateActivities,
  requireUpdateActivities,
  requireDeleteActivities,
  getTokenClaims,
} from '../middleware/auth';

const VALID_TYPES = ['email', 'call', 'meeting', 'note'];

const router = Router();
router.use(checkJwt, requireOrg);

/** GET /activities?account_id=&opportunity_id=&contact_id= */
router.get('/', requireReadActivities, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  const { account_id, opportunity_id, contact_id } = req.query;

  try {
    const params: unknown[] = [orgId];
    let sql = `SELECT ac.*, a.name AS account_name,
                 COALESCE(ARRAY_AGG(act_c.contact_id) FILTER (WHERE act_c.contact_id IS NOT NULL), '{}') AS contact_ids
               FROM activities ac
               LEFT JOIN accounts a ON a.id = ac.account_id
               LEFT JOIN activity_contacts act_c ON act_c.activity_id = ac.id
               WHERE ac.org_id = $1`;
    if (account_id) { sql += ` AND ac.account_id = $${params.push(account_id)}`; }
    if (opportunity_id) { sql += ` AND ac.opportunity_id = $${params.push(opportunity_id)}`; }
    if (contact_id) { sql += ` AND EXISTS (SELECT 1 FROM activity_contacts WHERE activity_id = ac.id AND contact_id = $${params.push(contact_id)})`; }
    sql += ` GROUP BY ac.id, a.name ORDER BY ac.activity_date DESC NULLS LAST, ac.created_at DESC`;

    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** GET /activities/:id */
router.get('/:id', requireReadActivities, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  try {
    const { rows } = await db.query(
      `SELECT ac.*, a.name AS account_name,
         COALESCE(ARRAY_AGG(act_c.contact_id) FILTER (WHERE act_c.contact_id IS NOT NULL), '{}') AS contact_ids
       FROM activities ac
       LEFT JOIN accounts a ON a.id = ac.account_id
       LEFT JOIN activity_contacts act_c ON act_c.activity_id = ac.id
       WHERE ac.id = $1 AND ac.org_id = $2
       GROUP BY ac.id, a.name`,
      [req.params.id, orgId],
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Activity not found' }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /activities */
router.post('/', requireCreateActivities, async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = getTokenClaims(req);
  const { type, subject, account_id, opportunity_id, contact_ids, description, activity_date } = req.body;

  if (!type || !VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }); return;
  }
  if (!subject?.trim()) { res.status(400).json({ error: 'subject is required' }); return; }
  if (!account_id) { res.status(400).json({ error: 'account_id is required' }); return; }

  const { rowCount } = await db.query(
    `SELECT 1 FROM accounts WHERE id = $1 AND org_id = $2`, [account_id, orgId],
  );
  if (!rowCount) { res.status(400).json({ error: 'Account not found in organization' }); return; }

  const contactIdsArray: string[] = Array.isArray(contact_ids) ? contact_ids : [];

  try {
    const { rows } = await db.query(
      `INSERT INTO activities
         (id, org_id, account_id, opportunity_id, type, subject, description, activity_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [createId(), orgId, account_id, opportunity_id ?? null,
       type, subject, description ?? null, activity_date ?? null, userId],
    );
    const activity = rows[0];

    if (contactIdsArray.length > 0) {
      const values = contactIdsArray.map((_, i) => `($1, $${i + 2})`).join(', ');
      await db.query(
        `INSERT INTO activity_contacts (activity_id, contact_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [activity.id, ...contactIdsArray],
      );
    }

    activity.contact_ids = contactIdsArray;
    res.status(201).json(activity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** PATCH /activities/:id */
router.patch('/:id', requireUpdateActivities, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  const fields = ['type', 'subject', 'account_id', 'opportunity_id', 'description', 'activity_date'];
  const updates: string[] = [];
  const values: unknown[] = [];

  if (req.body.type && !VALID_TYPES.includes(req.body.type)) {
    res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }); return;
  }

  fields.forEach((f) => {
    if (f in req.body) {
      updates.push(`${f} = $${values.length + 1}`);
      values.push(req.body[f]);
    }
  });

  if (updates.length === 0 && !('contact_ids' in req.body)) {
    res.status(400).json({ error: 'No fields to update' }); return;
  }

  try {
    let activity: Record<string, unknown> | undefined;

    if (updates.length > 0) {
      values.push(req.params.id, orgId);
      const { rows } = await db.query(
        `UPDATE activities SET ${updates.join(', ')} WHERE id = $${values.length - 1} AND org_id = $${values.length} RETURNING *`,
        values,
      );
      if (rows.length === 0) { res.status(404).json({ error: 'Activity not found' }); return; }
      activity = rows[0];
    } else {
      const { rows } = await db.query(
        `SELECT * FROM activities WHERE id = $1 AND org_id = $2`,
        [req.params.id, orgId],
      );
      if (rows.length === 0) { res.status(404).json({ error: 'Activity not found' }); return; }
      activity = rows[0];
    }

    if ('contact_ids' in req.body) {
      const contactIdsArray: string[] = Array.isArray(req.body.contact_ids) ? req.body.contact_ids : [];
      await db.query(`DELETE FROM activity_contacts WHERE activity_id = $1`, [req.params.id]);
      if (contactIdsArray.length > 0) {
        const vals = contactIdsArray.map((_, i) => `($1, $${i + 2})`).join(', ');
        await db.query(
          `INSERT INTO activity_contacts (activity_id, contact_id) VALUES ${vals} ON CONFLICT DO NOTHING`,
          [req.params.id, ...contactIdsArray],
        );
      }
      activity!.contact_ids = contactIdsArray;
    } else {
      const { rows: cRows } = await db.query(
        `SELECT ARRAY_AGG(contact_id) AS contact_ids FROM activity_contacts WHERE activity_id = $1`,
        [req.params.id],
      );
      activity!.contact_ids = cRows[0].contact_ids ?? [];
    }

    res.json(activity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** DELETE /activities/:id */
router.delete('/:id', requireDeleteActivities, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = getTokenClaims(req);
  try {
    const { rowCount } = await db.query(
      `DELETE FROM activities WHERE id = $1 AND org_id = $2`, [req.params.id, orgId],
    );
    if (!rowCount) { res.status(404).json({ error: 'Activity not found' }); return; }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as activitiesRouter };
