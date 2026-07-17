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
    domain:       required('AUTH0_DOMAIN'),
    // MCP サーバー自身の audience。MCP 仕様 (RFC 8707) の要請で、
    // mcp-remote が送る resource パラメータ = MCP サーバーの正規 URI と一致させる。
    audience:     required('AUTH0_AUDIENCE'),
    // OBO token exchange のターゲット audience。マイクロサービス側の API identifier で、
    // MCP サーバー自身の audience とは別の Auth0 API として登録する。
    apiAudience:  required('API_AUDIENCE'),
    clientId:     required('AUTH0_CLIENT_ID'),
    clientSecret: required('AUTH0_CLIENT_SECRET'),
  },
  services: {
    accounts:      process.env.ACCOUNTS_SERVICE_URL      ?? 'http://localhost:3001',
    opportunities: process.env.OPPORTUNITIES_SERVICE_URL ?? 'http://localhost:3002',
    contacts:      process.env.CONTACTS_SERVICE_URL      ?? 'http://localhost:3003',
    activities:    process.env.ACTIVITIES_SERVICE_URL    ?? 'http://localhost:3004',
    users:         process.env.USERS_SERVICE_URL         ?? 'http://localhost:3005',
  },
};
