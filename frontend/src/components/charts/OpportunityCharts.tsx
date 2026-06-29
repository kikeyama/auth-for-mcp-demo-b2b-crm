'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Opportunity, User, userDisplayName, OPPORTUNITY_STAGES } from '@/types';

const COLOR = '#4f46e5';

const formatYen = (v: number) => {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}億`;
  if (v >= 10_000) return `${Math.round(v / 10_000)}万`;
  return `${v}`;
};

const tooltipFormatter = (value: unknown) => [
  `¥${Number(value).toLocaleString('ja-JP')}`,
  '金額合計',
];

function ChartCard({ title, data }: { title: string; data: { name: string; amount: number }[] }) {
  const hasData = data.some(d => d.amount > 0);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {!hasData ? (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400">データなし</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: data.length > 4 ? 32 : 16, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              angle={data.length > 4 ? -30 : 0}
              textAnchor={data.length > 4 ? 'end' : 'middle'}
              interval={0}
            />
            <YAxis
              tickFormatter={formatYen}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              width={48}
            />
            <Tooltip formatter={tooltipFormatter} contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="amount" fill={COLOR} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function OpportunityCharts({ opportunities, users }: { opportunities: Opportunity[]; users: User[] }) {
  const userNameMap = new Map(users.map(u => [u.id, userDisplayName(u)]));

  // stage totals — show all 6 stages even if 0
  const stageData = OPPORTUNITY_STAGES.map(s => ({
    name: s.label,
    amount: opportunities
      .filter(o => o.stage === s.value && o.amount != null)
      .reduce((sum, o) => sum + Number(o.amount), 0),
  }));

  // monthly close totals
  const monthMap = new Map<string, number>();
  for (const o of opportunities) {
    if (!o.expected_close_date || o.amount == null) continue;
    const key = o.expected_close_date.slice(0, 7); // YYYY-MM
    monthMap.set(key, (monthMap.get(key) ?? 0) + Number(o.amount));
  }
  const monthData = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, amount]) => ({ name: k.replace('-', '/'), amount }));

  // owner totals
  const ownerMap = new Map<string, number>();
  for (const o of opportunities) {
    if (o.amount == null) continue;
    ownerMap.set(o.owner_id, (ownerMap.get(o.owner_id) ?? 0) + Number(o.amount));
  }
  const ownerData = [...ownerMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([id, amount]) => ({
      name: userNameMap.get(id) ?? id,
      amount,
    }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <ChartCard title="ステージ別 金額合計" data={stageData} />
      <ChartCard title="クローズ予定月別 金額合計" data={monthData} />
      <ChartCard title="オーナー別 金額合計" data={ownerData} />
    </div>
  );
}
