import { Pool } from 'pg';
import { config } from './config';

export const db = new Pool({ connectionString: config.database.connectionString });

db.on('error', (err) => {
  console.error('Unexpected DB error', err);
});
