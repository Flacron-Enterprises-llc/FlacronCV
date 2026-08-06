'use client';

import { useTranslations } from 'next-intl';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import Card from '@/components/ui/Card';
import { CRMRevenueDataPoint } from '@flacroncv/shared-types';

interface RevenueChartProps {
  data: CRMRevenueDataPoint[];
  loading?: boolean;
}

/**
 * Axis tick formatter that adapts to the magnitude of the data.
 *
 * The previous formatter was unconditionally `$${(v/1000).toFixed(0)}k`, so for
 * a young account every tick under $500 rounded to the SAME label and the axis
 * read "$0k, $0k, $0k, $0k" — no usable scale. Only abbreviate once the values
 * are actually large enough for the abbreviation to carry information.
 */
export function formatRevenueTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `$${(value / 1000).toFixed(0)}k`;
  if (abs >= 1_000) return `$${(value / 1000).toFixed(1)}k`;
  // Small values keep their exact amount: $0, $10, $20 …
  return `$${Math.round(value)}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  const t = useTranslations('crm');
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 shadow-lg dark:border-stone-700 dark:bg-stone-800">
      <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">{label}</p>
      <p className="mt-1 text-sm text-brand-600 dark:text-brand-400">
        {t('chart_revenue_tooltip_label')} <span className="font-bold">${payload[0]?.value?.toLocaleString()}</span>
      </p>
      <p className="text-sm text-stone-500 dark:text-stone-400">
        {t('chart_transactions_tooltip_label')} <span className="font-medium">{payload[0]?.payload?.transactions?.toLocaleString()}</span>
      </p>
    </div>
  );
};

export default function RevenueChart({ data, loading }: RevenueChartProps) {
  const t = useTranslations('crm');
  // "Has data" means at least one non-zero month — a 12-month series of zeros
  // is the shape a brand-new account produces and is not worth plotting.
  const hasData = data.some((d) => (d.revenue ?? 0) > 0 || (d.transactions ?? 0) > 0);
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-stone-900 dark:text-white">
            {t('chart_monthly_revenue_title')}
          </h3>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {t('chart_last_12_months')}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-lg bg-stone-100 dark:bg-stone-700" />
      ) : !hasData ? (
        /* Never render an axis-only chart against all-zero data — an empty plot
           reads as "revenue collapsed" rather than "nothing recorded yet". */
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-stone-200 text-center dark:border-stone-700">
          <TrendingUp className="mb-3 h-8 w-8 text-stone-300 dark:text-stone-600" />
          <p className="text-sm font-medium text-stone-600 dark:text-stone-300">
            {t('chart_no_data_title')}
          </p>
          <p className="mt-1 max-w-xs text-xs text-stone-500 dark:text-stone-400">
            {t('chart_no_data_desc')}
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ea580c" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
              </linearGradient>
            </defs>
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
              tickFormatter={formatRevenueTick}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#ea580c"
              strokeWidth={2}
              fill="url(#revenueGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#ea580c' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
