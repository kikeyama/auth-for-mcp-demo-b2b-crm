import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { accountsRouter } from './routes/accounts';
import { jwtErrorHandler } from './middleware/auth';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.allowedOrigins, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'account', status: 'ok' }));
app.use('/accounts', accountsRouter);

// JWT エラーは最後にキャッチ
app.use(jwtErrorHandler);

app.listen(config.port, () => {
  console.log(`account listening on port ${config.port}`);
});
