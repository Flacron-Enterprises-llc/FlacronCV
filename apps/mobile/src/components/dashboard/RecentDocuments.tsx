import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { CV } from '../../types/cv.types';
import { CoverLetter } from '../../types/cover-letter.types';
import { toDate } from '../../lib/utils';
import { formatDate, useT } from '../../i18n';
import { RTL_FLIP } from '../../i18n/native';
import { colors } from '../../theme/colors';
import { ErrorState } from '../ui/ErrorState';

type Document = (CV & { docType: 'cv' }) | (CoverLetter & { docType: 'cover-letter' });

interface RecentDocumentsProps {
  cvs?: CV[];
  coverLetters?: CoverLetter[];
  isLoading?: boolean;
  cvsFailed?: boolean;
  coverLettersFailed?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}

export function RecentDocuments({
  cvs = [],
  coverLetters = [],
  isLoading,
  cvsFailed,
  coverLettersFailed,
  errorMessage,
  onRetry,
}: RecentDocumentsProps) {
  const t = useT('dashboard.recent');
  const router = useRouter();
  const failureMessage = errorMessage ?? t('loadError');

  const docs: Document[] = [
    ...cvs.map((cv) => ({ ...cv, docType: 'cv' as const })),
    ...coverLetters.map((cl) => ({ ...cl, docType: 'cover-letter' as const })),
  ].sort((a, b) => {
    // D2 — unparseable dates sort last; never return NaN (Infinity - Infinity is NaN).
    const aTime = toDate(a.updatedAt)?.getTime();
    const bTime = toDate(b.updatedAt)?.getTime();
    if (aTime == null && bTime == null) return 0;
    if (aTime == null) return 1;
    if (bTime == null) return -1;
    return bTime - aTime;
  }).slice(0, 5);

  const listsFailed = !!cvsFailed || !!coverLettersFailed;

  if (isLoading) {
    return (
      <View className="gap-3">
        {[1, 2, 3].map((i) => (
          <View key={i} className="bg-white rounded-xl border border-stone-100 p-4 h-16" />
        ))}
      </View>
    );
  }

  if ((!!cvsFailed && !!coverLettersFailed) || (listsFailed && docs.length === 0)) {
    return <ErrorState message={failureMessage} onRetry={onRetry} />;
  }

  if (docs.length === 0) {
    return (
      <View className="items-center py-8">
        <Text className="text-stone-400">{t('empty')}</Text>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {docs.map((doc) => (
        <Pressable
          key={doc.id}
          onPress={() =>
            router.push(
              doc.docType === 'cv'
                ? `/(dashboard)/cvs/${doc.id}`
                : `/(dashboard)/cover-letters/${doc.id}`,
            )
          }
          className="bg-white rounded-xl border border-stone-100 p-4 flex-row items-center active:bg-stone-50"
        >
          <View
            className="w-10 h-10 rounded-xl items-center justify-center me-3 bg-brand-50"
          >
            <Ionicons
              name={doc.docType === 'cv' ? 'document-text' : 'mail'}
              size={18}
              color={colors.brand[600]}
            />
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-stone-800" numberOfLines={1}>
              {doc.title}
            </Text>
            <Text className="text-xs text-stone-400 mt-0.5">
              {t('meta', { kind: doc.docType === 'cv' ? 'cv' : 'coverLetter', date: formatDate(toDate(doc.updatedAt)) })}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.stone[300]} style={RTL_FLIP} />
        </Pressable>
      ))}
      {listsFailed ? <ErrorState message={failureMessage} onRetry={onRetry} /> : null}
    </View>
  );
}
