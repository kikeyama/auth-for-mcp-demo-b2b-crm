import { z } from 'zod';
import type { ToolDef } from '../registerTool';
import { callService } from '../serviceClient';
import { config } from '../config';

const base = config.services.opportunities;

const STAGES = ['prospect', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const;

export const opportunityTools: ToolDef[] = [
  {
    name: 'list_opportunities',
    description: '案件（商談）の一覧を取得します。account_id を指定すると特定の顧客企業の案件に絞り込めます。',
    inputSchema: {
      account_id: z.string().optional().describe('顧客企業IDで絞り込む'),
    },
    annotations: { readOnlyHint: true },
    execute: async (args, session) => {
      const qs = args.account_id ? `?account_id=${encodeURIComponent(args.account_id)}` : '';
      const data = await callService(base, `/opportunities${qs}`, 'GET', session, 'list_opportunities');
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'get_opportunity',
    description: '指定した案件の詳細を取得します。',
    inputSchema: {
      id: z.string().describe('案件ID'),
    },
    annotations: { readOnlyHint: true },
    execute: async (args, session) => {
      const data = await callService(base, `/opportunities/${args.id}`, 'GET', session, 'get_opportunity');
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'create_opportunity',
    description: '新しい案件（商談）を作成します。',
    inputSchema: {
      name:            z.string().describe('案件名（必須）'),
      account_id:      z.string().describe('顧客企業ID（必須）'),
      stage:           z.enum(STAGES).describe('フェーズ（必須）: prospect / qualification / proposal / negotiation / closed_won / closed_lost'),
      amount:          z.number().nonnegative().optional().describe('金額（円）'),
      close_date:      z.string().optional().describe('クローズ予定日 (YYYY-MM-DD)'),
      owner_id:        z.string().optional().describe('担当者のユーザーID'),
      description:     z.string().optional().describe('説明'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (args, session) => {
      const data = await callService(base, '/opportunities', 'POST', session, 'create_opportunity', args);
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'update_opportunity',
    description: '既存の案件情報を更新します。指定したフィールドのみ更新されます。',
    inputSchema: {
      id:          z.string().describe('案件ID（必須）'),
      name:        z.string().optional().describe('案件名'),
      stage:       z.enum(STAGES).optional().describe('フェーズ'),
      amount:      z.number().nonnegative().optional().describe('金額（円）'),
      close_date:  z.string().optional().describe('クローズ予定日 (YYYY-MM-DD)'),
      owner_id:    z.string().optional().describe('担当者のユーザーID'),
      description: z.string().optional().describe('説明'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (args, session) => {
      const { id, ...body } = args;
      const data = await callService(base, `/opportunities/${id}`, 'PATCH', session, 'update_opportunity', body);
      return JSON.stringify(data, null, 2);
    },
  },
  {
    name: 'list_opportunity_history',
    description: '指定した案件の変更履歴を新しい順に取得します。フィールドごとの変更前後の値と変更者・変更日時が含まれます。',
    inputSchema: {
      id: z.string().describe('案件ID'),
    },
    annotations: { readOnlyHint: true },
    execute: async (args, session) => {
      const data = await callService(base, `/opportunities/${args.id}/history`, 'GET', session, 'list_opportunity_history');
      return JSON.stringify(data, null, 2);
    },
  },
];
