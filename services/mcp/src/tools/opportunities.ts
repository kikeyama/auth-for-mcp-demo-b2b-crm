import { z } from 'zod';
import type { Tool } from 'fastmcp';
import type { MCPSession } from '../auth';
import { callService } from '../serviceClient';
import { config } from '../config';

const base = config.services.opportunities;

const STAGES = ['prospect', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const opportunityTools: Tool<MCPSession, any>[] = [
  {
    name: 'list_opportunities',
    description: '案件（商談）の一覧を取得します。account_id を指定すると特定の顧客企業の案件に絞り込めます。',
    parameters: z.object({
      account_id: z.string().optional().describe('顧客企業IDで絞り込む'),
    }),
    annotations: { readOnlyHint: true },
    execute: async (args, ctx) => {
      const qs = args.account_id ? `?account_id=${encodeURIComponent(args.account_id)}` : '';
      const data = await callService(base, `/opportunities${qs}`, 'GET', ctx.session!, 'list_opportunities');
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'get_opportunity',
    description: '指定した案件の詳細を取得します。',
    parameters: z.object({
      id: z.string().describe('案件ID'),
    }),
    annotations: { readOnlyHint: true },
    execute: async (args, ctx) => {
      const data = await callService(base, `/opportunities/${args.id}`, 'GET', ctx.session!, 'get_opportunity');
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'create_opportunity',
    description: '新しい案件（商談）を作成します。',
    parameters: z.object({
      name:            z.string().describe('案件名（必須）'),
      account_id:      z.string().describe('顧客企業ID（必須）'),
      stage:           z.enum(STAGES).describe('フェーズ（必須）: prospect / qualification / proposal / negotiation / closed_won / closed_lost'),
      amount:          z.number().nonnegative().optional().describe('金額（円）'),
      close_date:      z.string().optional().describe('クローズ予定日 (YYYY-MM-DD)'),
      owner_id:        z.string().optional().describe('担当者のユーザーID'),
      description:     z.string().optional().describe('説明'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (args, ctx) => {
      const data = await callService(base, '/opportunities', 'POST', ctx.session!, 'create_opportunity', args);
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'update_opportunity',
    description: '既存の案件情報を更新します。指定したフィールドのみ更新されます。',
    parameters: z.object({
      id:          z.string().describe('案件ID（必須）'),
      name:        z.string().optional().describe('案件名'),
      stage:       z.enum(STAGES).optional().describe('フェーズ'),
      amount:      z.number().nonnegative().optional().describe('金額（円）'),
      close_date:  z.string().optional().describe('クローズ予定日 (YYYY-MM-DD)'),
      owner_id:    z.string().optional().describe('担当者のユーザーID'),
      description: z.string().optional().describe('説明'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (args, ctx) => {
      const { id, ...body } = args;
      const data = await callService(base, `/opportunities/${id}`, 'PATCH', ctx.session!, 'update_opportunity', body);
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'list_opportunity_history',
    description: '指定した案件の変更履歴を新しい順に取得します。フィールドごとの変更前後の値と変更者・変更日時が含まれます。',
    parameters: z.object({
      id: z.string().describe('案件ID'),
    }),
    annotations: { readOnlyHint: true },
    execute: async (args, ctx) => {
      const data = await callService(base, `/opportunities/${args.id}/history`, 'GET', ctx.session!, 'list_opportunity_history');
      return JSON.stringify(data, null, 2);
    },
  },
];
