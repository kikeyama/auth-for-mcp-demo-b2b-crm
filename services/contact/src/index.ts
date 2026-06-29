import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { contactsRouter } from './routes/contacts';
import { jwtErrorHandler } from './middleware/auth';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.allowedOrigins, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'contact', status: 'ok' }));
app.use('/contacts', contactsRouter);

app.use(jwtErrorHandler);

app.listen(config.port, () => {
  console.log(`contact listening on port ${config.port}`);
});
