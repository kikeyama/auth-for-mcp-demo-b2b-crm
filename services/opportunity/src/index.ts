import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { opportunitiesRouter } from './routes/opportunities';
import { jwtErrorHandler } from './middleware/auth';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.allowedOrigins, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'opportunity', status: 'ok' }));
app.use('/opportunities', opportunitiesRouter);

app.use(jwtErrorHandler);

app.listen(config.port, () => {
  console.log(`opportunity listening on port ${config.port}`);
});
