import './tracing';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { handleEvent, Auth0Event } from './eventHandlers';

const app = express();
app.use(helmet());

app.get('/healthz/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/healthz/ready', (_req, res) => res.json({ status: 'ok' }));

// Auth0 Event Streams (Webhook) からのプッシュ受信。
app.post('/webhooks/auth0-events', express.json({ limit: '2mb' }), async (req, res) => {
  // Auth0のEvent Stream設定画面はAuthorizationフィールドの値に自動で "Bearer " を前置するため、
  // EVENT_STREAM_TOKEN自体にはBearerを含めず、比較時にここで付与する。
  const authHeader = req.header('authorization') ?? '';
  if (authHeader !== `Bearer ${config.eventStreamToken}`) {
    res.status(401).json({ error: 'invalid authorization token' });
    return;
  }

  const events: unknown[] = Array.isArray(req.body) ? req.body : [req.body];

  let processed = 0;
  for (const event of events) {
    if (!event || typeof (event as Auth0Event).type !== 'string') continue;
    try {
      await handleEvent(event as Auth0Event);
      processed++;
    } catch (err) {
      // 1件の失敗で他イベントの処理を止めない。Auth0側は非2xxでリトライするため、
      // ここでは200を返しつつログに残す（Event Streamsの配信保証が不明なため、
      // 個々の処理は冪等に作られている前提）。
      console.error(`Failed to process event type=${(event as Auth0Event).type}:`, err);
    }
  }

  res.status(200).json({ received: events.length, processed });
});

app.listen(config.port, () => {
  console.log(`auth0events listening on port ${config.port}`);
});
