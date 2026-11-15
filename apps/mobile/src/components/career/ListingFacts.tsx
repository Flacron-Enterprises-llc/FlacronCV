import React from 'react';
import { Text, View } from 'react-native';
import type { OpportunityItem } from '../../../../../packages/career-api-client/src/types';
import { useLocale, useT } from '../../i18n';
import { listingFacts, missingText } from '../../lib/career/opportunity-search';

/**
 * The stated facts of a listing, each with its label (website ListingFacts).
 * The fields depend on the category; fields the listing is silent about are
 * listed once as "not stated", never guessed.
 */
export function ListingFacts({ item, compact = false }: { item: OpportunityItem; compact?: boolean }) {
  const t = useT('careerOpportunities');
  useLocale();
  const facts = listingFacts(item);
  const missing = missingText(facts.missing);
  const rows = compact ? facts.rows.filter((row) => row.label !== t('field_category')).slice(0, 4) : facts.rows;
  return (
    <View>
      {rows.map((row) => (
        <View key={row.label} className="flex-row mt-1.5">
          <Text className="text-stone-500 text-sm w-32 me-2">{row.label}</Text>
          <Text className="text-stone-900 text-sm flex-1" selectable>
            {row.value}
          </Text>
        </View>
      ))}
      {facts.remoteNotWorldwide ? <Text className="text-stone-500 text-xs mt-2 leading-4">{t('remote_not_worldwide')}</Text> : null}
      {missing && !compact ? <Text className="text-stone-500 text-xs mt-2 leading-4">{missing}</Text> : null}
    </View>
  );
}
