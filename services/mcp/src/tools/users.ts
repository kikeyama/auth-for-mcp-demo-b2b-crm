import type { ToolDef } from '../registerTool';
import { callService } from '../serviceClient';
import { config } from '../config';

const base = config.services.users;

export const userTools: ToolDef[] = [
  {
    name: 'get_current_user',
    description:
      'アクセストークンに紐づく、現在ログイン中のユーザー自身の情報を取得します。' +
      '「自分がオーナーの案件」のように自分自身で絞り込みたい場合は、まずこのツールでユーザーIDを取得し、' +
      '各一覧ツールの結果を owner_id などのフィールドと比較してください。',
    inputSchema: {},
    annotations: { readOnlyHint: true },
    execute: async (_args, session) => {
      const data = await callService(base, `/users/${session.sub}`, 'GET', session, 'get_current_user');
      return JSON.stringify(data, null, 2);
    },
  },
];
