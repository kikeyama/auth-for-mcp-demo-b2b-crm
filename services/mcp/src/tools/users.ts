import { z } from 'zod';
import type { Tool } from 'fastmcp';
import type { MCPSession } from '../auth';
import { callService } from '../serviceClient';
import { config } from '../config';

const base = config.services.users;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const userTools: Tool<MCPSession, any>[] = [
  {
    name: 'get_user',
    description:
      'アクセストークンに紐づく、現在ログイン中のユーザー自身の情報を取得します。' +
      '「自分がオーナーの案件」のように自分自身で絞り込みたい場合は、まずこのツールでユーザーIDを取得し、' +
      '各一覧ツールの結果を owner_id などのフィールドと比較してください。',
    parameters: z.object({}),
    annotations: { readOnlyHint: true },
    execute: async (_args, ctx) => {
      const data = await callService(base, `/users/${ctx.session!.sub}`, 'GET', ctx.session!.token);
      return JSON.stringify(data, null, 2);
    },
  },
];
