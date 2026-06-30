import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3006'),
  mcpServerUrl: process.env.MCP_SERVER_URL ?? 'http://localhost:3006',
  auth0: {
    domain:   required('AUTH0_DOMAIN'),
    audience: required('AUTH0_AUDIENCE'),
  },
  services: {
    accounts:      process.env.ACCOUNTS_SERVICE_URL      ?? 'http://localhost:3001',
    opportunities: process.env.OPPORTUNITIES_SERVICE_URL ?? 'http://localhost:3002',
    contacts:      process.env.CONTACTS_SERVICE_URL      ?? 'http://localhost:3003',
    activities:    process.env.ACTIVITIES_SERVICE_URL    ?? 'http://localhost:3004',
  },
};
