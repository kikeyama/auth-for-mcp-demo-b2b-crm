import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { config } from './config';
import { apiClient, Auth0TokenVerifier, type MCPAuthInfo } from './auth/verifier';
import type { MCPSession } from './session';
import { registerTool, type ToolDef } from './registerTool';
import { accountTools } from './tools/accounts';
import { opportunityTools } from './tools/opportunities';
import { contactTools } from './tools/contacts';
import { activityTools } from './tools/activities';
import { userTools } from './tools/users';
import { getRecords, removeRecord } from './debug/store';
import { getAuthFailures, removeAuthFailure, recordAuthFailure } from './debug/authFailures';

const app = express();
app.use(express.json());

// ── RFC 9728: OAuth 2.0 Protected Resource Metadata ─────────────────────────
// MCP Client（mcp-remote 等）はこのドキュメントから Authorization Server（Auth0）の
// 場所を発見する。AS 自身のメタデータ（/.well-known/oauth-authorization-server）は
// Auth0 自身のドメインが提供するため、MCP サーバー側では実装しない
// （CIMD/DCR の公開可否も Auth0 テナント側の設定がそのまま反映される）。
const protectedResourceMetadata = {
  resource:              `${config.mcpServerUrl}/mcp`,
  authorization_servers: [`https://${config.auth0.domain}/`],
  jwks_uri:               `https://${config.auth0.domain}/.well-known/jwks.json`,
  scopes_supported: [
    'offline_access',
    'read:accounts',      'create:accounts',      'update:accounts',      'delete:accounts',
    'read:opportunities', 'create:opportunities', 'update:opportunities', 'delete:opportunities',
    'read:contacts',      'create:contacts',      'update:contacts',      'delete:contacts',
    'read:activities',    'create:activities',    'update:activities',    'delete:activities',
    'read:users',
  ],
  resource_name: 'NexusCRM MCP Server',
};

const resourceMetadataUrl  = getOAuthProtectedResourceMetadataUrl(new URL(`${config.mcpServerUrl}/mcp`));
const resourceMetadataPath = new URL(resourceMetadataUrl).pathname;

app.get(resourceMetadataPath, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(protectedResourceMetadata);
});
app.get('/.well-known/oauth-protected-resource', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(protectedResourceMetadata);
});

// requireBearerAuth が実際にレスポンスへ設定する WWW-Authenticate ヘッダーの生の値を
// キャプチャして /debug/auth-failures に記録する（デモ用の可視化。レスポンス自体には影響しない）。
function captureAuthFailureHeader(req: Request, res: Response, next: NextFunction) {
  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = ((name: string, value: number | string | readonly string[]) => {
    // Streamable HTTP トランスポート仕様では JSON-RPC メッセージの送信は必ず POST、
    // GET はオプションの SSE ストリームオープン用。mcp-remote の discoverOAuthServerInfo
    // による探索プローブは GET で送られるため、実際の接続試行（POST）のみを記録する。
    if (req.method === 'POST' && typeof name === 'string' && name.toLowerCase() === 'www-authenticate') {
      recordAuthFailure(String(value));
    }
    return originalSetHeader(name, value);
  }) as typeof res.setHeader;
  next();
}

const verifier = new Auth0TokenVerifier(apiClient);

const ALL_TOOLS: ToolDef[] = [
  ...accountTools,
  ...opportunityTools,
  ...contactTools,
  ...activityTools,
  ...userTools,
];

// ── MCP Endpoint ─────────────────────────────────────────────────────────
// 1. requireBearerAuth が MCP トークン（audience = AUTH0_AUDIENCE）を検証
// 2. リクエストごとに McpServer を生成し、ツール呼び出し時に OBO 交換で
//    ダウンストリーム API トークン（audience = API_AUDIENCE）へ交換する
app.all('/mcp', captureAuthFailureHeader, requireBearerAuth({ verifier, resourceMetadataUrl }), async (req, res) => {
  const authInfo = req.auth as MCPAuthInfo;
  const session: MCPSession = {
    token:  authInfo.token,
    sub:    authInfo.sub,
    orgId:  authInfo.orgId,
    scopes: authInfo.scopes,
  };

  const server = new McpServer({ name: 'NexusCRM MCP Server', version: '1.0.0' });
  for (const tool of ALL_TOOLS) {
    registerTool(server, tool, session);
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/healthz/live',  (_req, res) => res.json({ status: 'ok' }));
app.get('/healthz/ready', (_req, res) => res.json({ status: 'ok' }));

// デモ用トークンビューア: MCP トークンと OBO 交換後の API トークンをデコードして
// 直近の履歴を返す。本番運用では ENABLE_TOKEN_DEBUG=false で無効化する。
if (process.env.ENABLE_TOKEN_DEBUG !== 'false') {
  app.get('/debug/tokens', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ records: getRecords() });
  });
  app.delete('/debug/tokens/:id', (req, res) => {
    const removed = removeRecord(req.params.id);
    if (!removed) { res.status(404).json({ error: 'Record not found' }); return; }
    res.status(204).end();
  });
  app.get('/debug/auth-failures', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ records: getAuthFailures() });
  });
  app.delete('/debug/auth-failures/:id', (req, res) => {
    const removed = removeAuthFailure(req.params.id);
    if (!removed) { res.status(404).json({ error: 'Record not found' }); return; }
    res.status(204).end();
  });
  console.log('Token debug viewer: enabled at /debug/tokens (ENABLE_TOKEN_DEBUG=false to disable)');
}

app.listen(config.port, () => {
  console.log(`NexusCRM MCP Server running on port ${config.port}`);
  console.log(`  MCP endpoint:                   ${config.mcpServerUrl}/mcp`);
  console.log(`  OAuth protected resource:       ${resourceMetadataUrl}`);
  console.log(`  Authorization server:           https://${config.auth0.domain}/`);
});
