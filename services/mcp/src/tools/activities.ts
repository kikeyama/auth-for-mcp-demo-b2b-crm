import { z } from 'zod';
import type { Tool } from 'fastmcp';
import type { MCPSession } from '../auth';
import { callService } from '../serviceClient';
import { config } from '../config';

const base = config.services.activities;

const ACTIVITY_TYPES = ['email', 'call', 'meeting', 'note'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const activityTools: Tool<MCPSession, any>[] = [
  {
    name: 'list_activities',
    description: '活動履歴の一覧を取得します。account_id や opportunity_id で絞り込めます。',
    parameters: z.object({
      account_id:     z.string().optional().describe('顧客企業IDで絞り込む'),
      opportunity_id: z.string().optional().describe('案件IDで絞り込む'),
      contact_id:     z.string().optional().describe('連絡先IDで絞り込む'),
    }),
    annotations: { readOnlyHint: true },
    execute: async (args, ctx) => {
      const params = new URLSearchParams();
      if (args.account_id)     params.set('account_id',     args.account_id);
      if (args.opportunity_id) params.set('opportunity_id', args.opportunity_id);
      if (args.contact_id)     params.set('contact_id',     args.contact_id);
      const qs = params.size > 0 ? `?${params.toString()}` : '';
      const data = await callService(base, `/activities${qs}`, 'GET', ctx.session!, 'list_activities');
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'get_activity',
    description: '指定した活動履歴の詳細を取得します。',
    parameters: z.object({
      id: z.string().describe('活動履歴ID'),
    }),
    annotations: { readOnlyHint: true },
    execute: async (args, ctx) => {
      const data = await callService(base, `/activities/${args.id}`, 'GET', ctx.session!, 'get_activity');
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'create_activity',
    description: '活動履歴を記録します。メール送信・電話・ミーティング・メモなどを記録できます。',
    parameters: z.object({
      type:           z.enum(ACTIVITY_TYPES).describe('種別（必須）: email / call / meeting / note'),
      subject:        z.string().describe('件名（必須）'),
      account_id:     z.string().describe('顧客企業ID（必須）'),
      opportunity_id: z.string().optional().describe('関連する案件ID'),
      contact_ids:    z.array(z.string()).optional().describe('関連する連絡先IDの配列'),
      description:    z.string().optional().describe('内容・メモ'),
      activity_date:  z.string().optional().describe('活動日時 (ISO 8601形式, 例: 2024-06-01T10:00:00)'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (args, ctx) => {
      const data = await callService(base, '/activities', 'POST', ctx.session!, 'create_activity', args);
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'update_activity',
    description: '既存の活動履歴を更新します。指定したフィールドのみ更新されます。',
    parameters: z.object({
      id:             z.string().describe('活動履歴ID（必須）'),
      type:           z.enum(ACTIVITY_TYPES).optional().describe('種別'),
      subject:        z.string().optional().describe('件名'),
      opportunity_id: z.string().optional().describe('関連する案件ID'),
      contact_ids:    z.array(z.string()).optional().describe('関連する連絡先IDの配列'),
      description:    z.string().optional().describe('内容・メモ'),
      activity_date:  z.string().optional().describe('活動日時 (ISO 8601形式)'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (args, ctx) => {
      const { id, ...body } = args;
      const data = await callService(base, `/activities/${id}`, 'PATCH', ctx.session!, 'update_activity', body);
      return JSON.stringify(data, null, 2);
    },
  },
];
