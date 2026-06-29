import { OpportunityStage, ActivityType } from '@/types';

const STAGE_STYLES: Record<OpportunityStage, string> = {
  prospect:      'bg-gray-100 text-gray-700',
  qualification: 'bg-blue-100 text-blue-700',
  proposal:      'bg-purple-100 text-purple-700',
  negotiation:   'bg-yellow-100 text-yellow-700',
  closed_won:    'bg-green-100 text-green-700',
  closed_lost:   'bg-red-100 text-red-700',
};

const STAGE_LABELS: Record<OpportunityStage, string> = {
  prospect:      'プロスペクト',
  qualification: '要件確認',
  proposal:      '提案',
  negotiation:   '交渉',
  closed_won:    '受注',
  closed_lost:   '失注',
};

const ACTIVITY_STYLES: Record<ActivityType, string> = {
  email:   'bg-blue-100 text-blue-700',
  call:    'bg-green-100 text-green-700',
  meeting: 'bg-purple-100 text-purple-700',
  note:    'bg-gray-100 text-gray-700',
};

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  email:   'メール',
  call:    '電話',
  meeting: 'ミーティング',
  note:    'メモ',
};

export function StageBadge({ stage }: { stage: OpportunityStage }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STAGE_STYLES[stage]}`}>
      {STAGE_LABELS[stage]}
    </span>
  );
}

export function ActivityTypeBadge({ type }: { type: ActivityType }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ACTIVITY_STYLES[type]}`}>
      {ACTIVITY_LABELS[type]}
    </span>
  );
}
