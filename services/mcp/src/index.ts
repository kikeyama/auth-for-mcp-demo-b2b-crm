import { FastMCP } from 'fastmcp';
import { config } from './config';
import { authenticate, type MCPSession } from './auth';
import { accountTools } from './tools/accounts';
import { opportunityTools } from './tools/opportunities';
import { contactTools } from './tools/contacts';
import { activityTools } from './tools/activities';

const server = new FastMCP<MCPSession>({
  name: 'NexusCRM MCP Server',
  version: '1.0.0',
  authenticate,
  oauth: {
    enabled: true,
    protectedResource: {
      // resource must be the MCP server URL itself (RFC 9728 §2) so that clients
      // such as mcp-remote can validate the protected resource metadata.
      // Audience validation for Auth0 is handled separately in auth.ts via ApiClient.
      resource:             `${config.mcpServerUrl}/mcp`,
      authorizationServers: [`https://${config.auth0.domain}/`],
      jwksUri:              `https://${config.auth0.domain}/.well-known/jwks.json`,
      scopesSupported: [
        'read:accounts',   'create:accounts',   'update:accounts',   'delete:accounts',
        'read:opportunities', 'create:opportunities', 'update:opportunities', 'delete:opportunities',
        'read:contacts',   'create:contacts',   'update:contacts',   'delete:contacts',
        'read:activities', 'create:activities', 'update:activities', 'delete:activities',
      ],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authorizationServer: {
      issuer:                  `https://${config.auth0.domain}/`,
      // audience= を固定することで Auth0 が JWT アクセストークンを発行する。
      // mcp-remote はこのパラメータを付けないため、authorizationEndpoint に埋め込む。
      authorizationEndpoint:   `https://${config.auth0.domain}/authorize?audience=${config.auth0.audience}`,
      tokenEndpoint:           `https://${config.auth0.domain}/oauth/token`,
      responseTypesSupported:  ['code'],
      codeChallengeMethodsSupported: ['S256'],
      grantTypesSupported:     ['authorization_code', 'refresh_token'],
      // CIMD (Client ID Metadata Document) - MCP spec preferred over DCR
      // fastmcp's type definition predates this field; cast required
      client_id_metadata_document_supported: true,
      // DCR kept as fallback for clients that don't support CIMD
      registrationEndpoint:    `https://${config.auth0.domain}/oidc/register`,
    } as any,
  },
});

server.addTools([
  ...accountTools,
  ...opportunityTools,
  ...contactTools,
  ...activityTools,
]);

server.start({
  transportType: 'httpStream',
  httpStream: {
    port:      config.port,
    endpoint:  '/mcp',
    stateless: false,
  },
});

console.log(`NexusCRM MCP Server running on port ${config.port}`);
console.log(`  MCP endpoint:                   ${config.mcpServerUrl}/mcp`);
console.log(`  OAuth protected resource:       ${config.mcpServerUrl}/.well-known/oauth-protected-resource`);
console.log(`  OAuth authorization server:     ${config.mcpServerUrl}/.well-known/oauth-authorization-server`);
