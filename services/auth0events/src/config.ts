import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3008'),
  eventStreamToken: required('EVENT_STREAM_TOKEN'),
  auth0: {
    domain:       required('AUTH0_DOMAIN'),
    // user サービス自身の audience（services/user の AUTH0_AUDIENCE と同じ値）
    audience:     required('AUTH0_AUDIENCE'),
    clientId:     required('AUTH0_SYNC_CLIENT_ID'),
    clientSecret: required('AUTH0_SYNC_CLIENT_SECRET'),
  },
  userServiceUrl: process.env.USER_SERVICE_URL ?? 'http://localhost:3005',
};
