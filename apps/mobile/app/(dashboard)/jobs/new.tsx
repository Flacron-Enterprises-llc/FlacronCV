import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { JobForm } from '../../../src/components/jobs/JobForm';

export default function NewJobScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <JobForm mode="create" />
    </SafeAreaView>
  );
}
