import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { contactsRouter } from './routes/contacts';
import { jwtErrorHandler } from './middleware/auth';
import { db } from './db';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.allowedOrigins, credentials: true }));
app.use(express.json());

app.get('/healthz/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/healthz/ready', async (_req, res): Promise<void> => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});
app.use('/contacts', contactsRouter);

app.use(jwtErrorHandler);

app.listen(config.port, () => {
  console.log(`contact listening on port ${config.port}`);
});
