import pg, { Pool } from 'pg';
import { config } from './config';

// pg's default DATE parser creates a Date at local midnight, which shifts
// the date by timezone offset when serialized to JSON (e.g. JST → -1 day).
// Return the raw YYYY-MM-DD string instead.
pg.types.setTypeParser(1082, (val: string) => val);

export const db = new Pool({ connectionString: config.database.connectionString });

db.on('error', (err) => {
  console.error('Unexpected DB error', err);
});
