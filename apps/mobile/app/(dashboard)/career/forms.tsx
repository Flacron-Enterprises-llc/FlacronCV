import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader } from '../../../src/components/career/CareerHeader';
import { FeatureState } from '../../../src/components/career/FeatureState';
import { useT } from '../../../src/i18n';

/**
 * Assisted forms (website: /career/forms). Filling a reviewed form needs a
 * browser helper on a computer, which is not published, and the app has no
 * form helper, so this is an honest "coming soon": no action, no credit.
 */
export default function FormsScreen() {
  const t = useT('careerBusiness');
  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('nav.forms')} subtitle={t('scope.formsMetaDescription')} />
      {/* LINK_COMING lists /career/forms, so this never renders children. */}
      <FeatureState href="/career/forms" soonTitle={t('scope.formsSoonTitle')} soonBody={t('scope.formsSoonBody')}>
        {null}
      </FeatureState>
    </SafeAreaView>
  );
}
