import { z } from 'zod';
import type { Tool } from 'fastmcp';
import type { MCPSession } from '../auth';
import { callService } from '../serviceClient';
import { config } from '../config';

const base = config.services.contacts;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const contactTools: Tool<MCPSession, any>[] = [
  {
    name: 'list_contacts',
    description: '連絡先（コンタクト）の一覧を取得します。account_id を指定すると特定の顧客企業の連絡先に絞り込めます。',
    parameters: z.object({
      account_id: z.string().optional().describe('顧客企業IDで絞り込む'),
    }),
    annotations: { readOnlyHint: true },
    execute: async (args, ctx) => {
      const qs = args.account_id ? `?account_id=${encodeURIComponent(args.account_id)}` : '';
      const data = await callService(base, `/contacts${qs}`, 'GET', ctx.session!.token);
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'get_contact',
    description: '指定した連絡先の詳細を取得します。',
    parameters: z.object({
      id: z.string().describe('連絡先ID'),
    }),
    annotations: { readOnlyHint: true },
    execute: async (args, ctx) => {
      const data = await callService(base, `/contacts/${args.id}`, 'GET', ctx.session!.token);
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'create_contact',
    description: '新しい連絡先を作成します。',
    parameters: z.object({
      last_name:    z.string().describe('姓（必須）'),
      first_name:   z.string().optional().describe('名'),
      account_id:   z.string().describe('所属する顧客企業ID（必須）'),
      email:        z.string().email().optional().describe('メールアドレス'),
      phone:        z.string().optional().describe('電話番号'),
      title:        z.string().optional().describe('役職'),
      department:   z.string().optional().describe('部署'),
      description:  z.string().optional().describe('備考'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (args, ctx) => {
      const data = await callService(base, '/contacts', 'POST', ctx.session!.token, args);
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'update_contact',
    description: '既存の連絡先情報を更新します。指定したフィールドのみ更新されます。',
    parameters: z.object({
      id:           z.string().describe('連絡先ID（必須）'),
      last_name:    z.string().optional().describe('姓'),
      first_name:   z.string().optional().describe('名'),
      email:        z.string().email().optional().describe('メールアドレス'),
      phone:        z.string().optional().describe('電話番号'),
      title:        z.string().optional().describe('役職'),
      department:   z.string().optional().describe('部署'),
      description:  z.string().optional().describe('備考'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (args, ctx) => {
      const { id, ...body } = args;
      const data = await callService(base, `/contacts/${id}`, 'PATCH', ctx.session!.token, body);
      return JSON.stringify(data, null, 2);
    },
  },
];
