import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { recordEvent, getEvents, removeEvent, extractRequestedClientId } from './store';

const app = express();
app.use(helmet());

app.get('/healthz/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/healthz/ready', (_req, res) => res.json({ status: 'ok' }));

// Auth0 Log Streams (Custom Webhook) からのプッシュ受信。
// Content Format は JSON lines / array / object のいずれかがテナント設定で選べるため、
// raw text で受け取ってから両方のケースに対応する。
app.post('/webhooks/auth0-logs', express.text({ type: '*/*', limit: '2mb' }), (req, res) => {
  const authHeader = req.header('authorization') ?? '';
  if (authHeader !== config.logStreamToken) {
    res.status(401).json({ error: 'invalid authorization token' });
    return;
  }

  const body = typeof req.body === 'string' ? req.body.trim() : '';
  if (!body) {
    res.status(200).json({ received: 0 });
    return;
  }

  let events: unknown[] = [];
  try {
    const parsed = JSON.parse(body);
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // JSON lines: 1行ずつ個別のJSONオブジェクトとしてパースする
    events = body
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((e): e is Record<string, unknown> => e !== null);
  }

  let stored = 0;
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const e = event as Record<string, unknown>;

    // Log Stream 側は type: "s" (Success Login) のみ送る設定だが、念のためここでも確認する。
    if (e.type !== 's') continue;

    // CIMD 経由の認証リクエストのみを対象にする: details.requested_client_id が URL 形式のもの。
    const requestedClientId = extractRequestedClientId(e) ?? '';
    if (!requestedClientId.startsWith('http://') && !requestedClientId.startsWith('https://')) continue;

    recordEvent(e);
    stored++;
  }

  res.status(200).json({ received: events.length, stored });
});

if (config.enableLogViewer) {
  app.get('/logs', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ records: getEvents() });
  });
  app.delete('/logs/:id', (req, res) => {
    const removed = removeEvent(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    res.status(204).end();
  });
  console.log('Log viewer: enabled at /logs (ENABLE_LOG_VIEWER=false to disable)');
}

app.listen(config.port, () => {
  console.log(`auth0logs listening on port ${config.port}`);
});
