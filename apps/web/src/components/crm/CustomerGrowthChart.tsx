'use client';

import { useTranslations } from 'next-intl';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import Card from '@/components/ui/Card';
import { CRMCustomerGrowthDataPoint } from '@flacroncv/shared-types';

interface CustomerGrowthChartProps {
  data: CRMCustomerGrowthDataPoint[];
  loading?: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 shadow-lg dark:border-stone-700 dark:bg-stone-800">
      <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="mt-1 text-sm" style={{ color: entry.color }}>
          {entry.name}: <span className="font-bold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function CustomerGrowthChart({ data, loading }: CustomerGrowthChartProps) {
  const t = useTranslations('crm');
  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-stone-900 dark:text-white">
          {t('chart_customer_lead_growth_title')}
        </h3>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {t('chart_new_additions_per_month')}
        </p>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-lg bg-stone-100 dark:bg-stone-700" />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: '#78716c' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#78716c' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value) => (
                <span className="text-stone-600 dark:text-stone-400">{value}</span>
              )}
            />
            <Bar dataKey="customers" name={t('customers')} fill="#ea580c" radius={[3, 3, 0, 0]} />
            <Bar dataKey="leads" name={t('leads')} fill="#c2410c" opacity={0.5} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
