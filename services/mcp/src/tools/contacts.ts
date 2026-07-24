import { z } from 'zod';
import type { ToolDef } from '../registerTool';
import { callService } from '../serviceClient';
import { config } from '../config';

const base = config.services.contacts;

export const contactTools: ToolDef[] = [
  {
    name: 'list_contacts',
    description: '連絡先（コンタクト）の一覧を取得します。account_id を指定すると特定の顧客企業の連絡先に絞り込めます。',
    inputSchema: {
      account_id: z.string().optional().describe('顧客企業IDで絞り込む'),
    },
    annotations: { readOnlyHint: true },
    execute: async (args, session) => {
      const qs = args.account_id ? `?account_id=${encodeURIComponent(args.account_id)}` : '';
      const data = await callService(base, `/contacts${qs}`, 'GET', session, 'list_contacts');
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'get_contact',
    description: '指定した連絡先の詳細を取得します。',
    inputSchema: {
      id: z.string().describe('連絡先ID'),
    },
    annotations: { readOnlyHint: true },
    execute: async (args, session) => {
      const data = await callService(base, `/contacts/${args.id}`, 'GET', session, 'get_contact');
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'create_contact',
    description: '新しい連絡先を作成します。',
    inputSchema: {
      last_name:    z.string().describe('姓（必須）'),
      first_name:   z.string().optional().describe('名'),
      account_id:   z.string().describe('所属する顧客企業ID（必須）'),
      email:        z.string().email().optional().describe('メールアドレス'),
      phone:        z.string().optional().describe('電話番号'),
      title:        z.string().optional().describe('役職'),
      department:   z.string().optional().describe('部署'),
      description:  z.string().optional().describe('備考'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (args, session) => {
      const data = await callService(base, '/contacts', 'POST', session, 'create_contact', args);
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'update_contact',
    description: '既存の連絡先情報を更新します。指定したフィールドのみ更新されます。',
    inputSchema: {
      id:           z.string().describe('連絡先ID（必須）'),
      last_name:    z.string().optional().describe('姓'),
      first_name:   z.string().optional().describe('名'),
      email:        z.string().email().optional().describe('メールアドレス'),
      phone:        z.string().optional().describe('電話番号'),
      title:        z.string().optional().describe('役職'),
      department:   z.string().optional().describe('部署'),
      description:  z.string().optional().describe('備考'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (args, session) => {
      const { id, ...body } = args;
      const data = await callService(base, `/contacts/${id}`, 'PATCH', session, 'update_contact', body);
      return JSON.stringify(data, null, 2);
    },
  },
];
