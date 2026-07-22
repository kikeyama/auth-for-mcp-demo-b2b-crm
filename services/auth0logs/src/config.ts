import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3007'),
  logStreamToken: required('LOG_STREAM_TOKEN'),
  enableLogViewer: process.env.ENABLE_LOG_VIEWER !== 'false',
};
