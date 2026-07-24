import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import type { MCPSession } from './session';

export interface ToolDef {
  name: string;
  description: string;
  // ツールごとに異なる zod shape を持つため any は避けられない。args の型付けを
  // 諦める代わりに ctx（session）側は型付けを保つ、という既存実装のトレードオフを踏襲。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: Record<string, z.ZodType<any>>;
  annotations?: Record<string, boolean>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (args: any, session: MCPSession) => Promise<string>;
}

export function registerTool(server: McpServer, tool: ToolDef, session: MCPSession) {
  // inputSchema の shape はツールごとに異なる動的な Record であり、静的に決まらないため
  // registerTool の generic 推論が無限に深くなってしまう (TS2589)。ToolDef.execute が既に
  // args: any を受け取る設計と一貫させ、ここでは意図的に型推論をバイパスする。
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    } as Parameters<McpServer['registerTool']>[1],
    async (args) => {
      try {
        const text = await tool.execute(args, session);
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `エラー: ${message}` }], isError: true };
      }
    },
  );
}
