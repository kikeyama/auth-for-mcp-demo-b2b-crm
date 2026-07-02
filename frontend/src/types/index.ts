export interface User {
  id: string;
  org_id: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified: boolean;
  picture?: string;
  last_login_at: string;
  created_at: string;
  updated_at: string;
}

export function userDisplayName(user: User): string {
  if (user.name) return user.name;
  const full = [user.given_name, user.family_name].filter(Boolean).join(' ');
  return full || user.id;
}

export interface Account {
  id: string;
  org_id: string;
  name: string;
  industry?: string;
  website?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  employee_count?: number;
  annual_revenue?: number;
  owner_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type OpportunityStage =
  | 'prospect'
  | 'qualification'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

export interface Opportunity {
  id: string;
  org_id: string;
  account_id?: string;
  account_name?: string;
  name: string;
  stage: OpportunityStage;
  amount?: number;
  expected_close_date?: string;
  probability?: number;
  owner_id: string;
  description?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  org_id: string;
  account_id?: string;
  account_name?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  title?: string;
  department?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ActivityType = 'email' | 'call' | 'meeting' | 'note';

export interface Activity {
  id: string;
  org_id: string;
  account_id?: string;
  account_name?: string;
  opportunity_id?: string;
  contact_id?: string;
  contact_ids?: string[];
  type: ActivityType;
  subject: string;
  description?: string;
  activity_date?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const OPPORTUNITY_STAGES: { value: OpportunityStage; label: string }[] = [
  { value: 'prospect',      label: 'プロスペクト' },
  { value: 'qualification', label: '要件確認' },
  { value: 'proposal',      label: '提案' },
  { value: 'negotiation',   label: '交渉' },
  { value: 'closed_won',    label: '受注' },
  { value: 'closed_lost',   label: '失注' },
];

export const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: 'email',   label: 'メール' },
  { value: 'call',    label: '電話' },
  { value: 'meeting', label: 'ミーティング' },
  { value: 'note',    label: 'メモ' },
];
