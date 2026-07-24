import { z } from 'zod';
import type { ToolDef } from '../registerTool';
import { callService } from '../serviceClient';
import { config } from '../config';

const base = config.services.accounts;

export const accountTools: ToolDef[] = [
  {
    name: 'list_accounts',
    description: '顧客企業の一覧を取得します。名前・業種・都市・国などの情報が含まれます。',
    inputSchema: {},
    annotations: { readOnlyHint: true },
    execute: async (_args, session) => {
      const data = await callService(base, '/accounts', 'GET', session, 'list_accounts');
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'get_account',
    description: '指定した顧客企業の詳細を取得します。',
    inputSchema: {
      id: z.string().describe('アカウントID'),
    },
    annotations: { readOnlyHint: true },
    execute: async (args, session) => {
      const data = await callService(base, `/accounts/${args.id}`, 'GET', session, 'get_account');
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'create_account',
    description: '顧客企業を新規作成します。',
    inputSchema: {
      name:           z.string().describe('会社名（必須）'),
      industry:       z.string().optional().describe('業種'),
      website:        z.string().url().optional().describe('ウェブサイトURL'),
      phone:          z.string().optional().describe('電話番号'),
      city:           z.string().optional().describe('都市'),
      country:        z.string().optional().describe('国'),
      employee_count: z.number().int().positive().optional().describe('従業員数'),
      annual_revenue: z.number().nonnegative().optional().describe('年商（円）'),
      address:        z.string().optional().describe('住所'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (args, session) => {
      const data = await callService(base, '/accounts', 'POST', session, 'create_account', args);
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'update_account',
    description: '既存の顧客企業の情報を更新します。指定したフィールドのみ更新されます。',
    inputSchema: {
      id:             z.string().describe('アカウントID（必須）'),
      name:           z.string().optional().describe('会社名'),
      industry:       z.string().optional().describe('業種'),
      website:        z.string().url().optional().describe('ウェブサイトURL'),
      phone:          z.string().optional().describe('電話番号'),
      city:           z.string().optional().describe('都市'),
      country:        z.string().optional().describe('国'),
      employee_count: z.number().int().positive().optional().describe('従業員数'),
      annual_revenue: z.number().nonnegative().optional().describe('年商（円）'),
      address:        z.string().optional().describe('住所'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (args, session) => {
      const { id, ...body } = args;
      const data = await callService(base, `/accounts/${id}`, 'PATCH', session, 'update_account', body);
      return JSON.stringify(data, null, 2);
    },
  },
];
