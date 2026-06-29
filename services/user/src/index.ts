import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { usersRouter } from './routes/users';
import { jwtErrorHandler } from './middleware/auth';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.allowedOrigins, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'user', status: 'ok' }));
app.use('/users', usersRouter);

app.use(jwtErrorHandler);

app.listen(config.port, () => {
  console.log(`user listening on port ${config.port}`);
});
