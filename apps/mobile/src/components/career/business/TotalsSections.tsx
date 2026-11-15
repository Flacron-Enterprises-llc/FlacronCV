import React from 'react';
import { Text, View } from 'react-native';
import { useBusinessReport, useBusinessUsage } from '../../../hooks/career/business';
import { formatNumber, useT } from '../../../i18n';
import { invoiceLine, reportRows, scopeErrorMessage, unitLabel, unitLeft } from '../../../lib/career/business';
import { NoteView, Section } from './parts';

/** Pooled allowances for the whole workspace (owner and billing administrators; managers too, as on the website). */
export function UsageSection({ workspace }: { workspace: string | undefined }) {
  const t = useT('careerBusiness.scope');
  const usage = useBusinessUsage(workspace, true);
  return (
    <Section title={t('usageHeading')} help={t('usageHelp')}>
      {usage.error ? <NoteView note={{ tone: 'error', text: scopeErrorMessage(usage.error) }} /> : null}
      {usage.isLoading ? <Text className="text-stone-500 text-sm mt-3">{t('loading')}</Text> : null}
      {usage.data ? (
        <>
          {usage.data.units.map((unit) => (
            <View key={unit.unit} className="border border-stone-100 rounded-xl p-3 mt-2" accessible accessibilityLabel={`${unitLabel(unit.unit)}: ${unitLeft(unit)}`}>
              <Text className="font-semibold text-stone-900 text-sm">{unitLabel(unit.unit)}</Text>
              <Text className="text-stone-500 text-sm mt-0.5">{unitLeft(unit)}</Text>
            </View>
          ))}
          {usage.data.invoices ? (
            <>
              <Text className="font-bold text-stone-900 mt-4" accessibilityRole="header">
                {t('invoicesHeading')}
              </Text>
              {usage.data.invoices.length === 0 ? (
                <Text className="text-stone-500 text-sm mt-1">{t('invoicesEmpty')}</Text>
              ) : (
                usage.data.invoices.map((invoice, index) => (
                  <View key={index} className="flex-row flex-wrap justify-between gap-2 py-1.5 border-b border-stone-100">
                    <Text className="text-stone-900 text-sm">{invoice.sku}</Text>
                    <Text className="text-stone-500 text-sm">{invoiceLine(invoice)}</Text>
                  </View>
                ))
              )}
            </>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}

/** Aggregate counts only: no names, documents or individual outcomes. */
export function ReportSection({ workspace }: { workspace: string | undefined }) {
  const t = useT('careerBusiness.scope');
  const report = useBusinessReport(workspace, true);
  return (
    <Section title={t('reportHeading')} help={t('reportHelp')}>
      {report.error ? <NoteView note={{ tone: 'error', text: scopeErrorMessage(report.error) }} /> : null}
      {report.isLoading ? <Text className="text-stone-500 text-sm mt-3">{t('loading')}</Text> : null}
      {report.data ? (
        <View className="flex-row flex-wrap -mx-1 mt-2">
          {reportRows(report.data).map((row) => (
            <View key={row.key} className="w-1/2 p-1">
              <View className="border border-stone-100 rounded-xl p-3" accessible accessibilityLabel={`${row.label}: ${row.value}`}>
                <Text className="text-[11px] font-semibold uppercase text-stone-500" numberOfLines={2}>
                  {row.label}
                </Text>
                <Text className="text-xl font-black text-stone-900 mt-1">{formatNumber(row.value)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Section>
  );
}
