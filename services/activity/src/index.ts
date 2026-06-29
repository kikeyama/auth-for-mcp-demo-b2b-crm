import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { activitiesRouter } from './routes/activities';
import { jwtErrorHandler } from './middleware/auth';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.allowedOrigins, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ service: 'activity', status: 'ok' }));
app.use('/activities', activitiesRouter);

app.use(jwtErrorHandler);

app.listen(config.port, () => {
  console.log(`activity listening on port ${config.port}`);
});
