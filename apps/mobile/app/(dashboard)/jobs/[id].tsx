import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { JobForm } from '../../../src/components/jobs/JobForm';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useJob } from '../../../src/hooks/useJobs';
import { requestFailureMessage } from '../../../src/lib/api-errors';

export default function EditJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, isLoading, error, refetch } = useJob(id ?? null);

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
        <ErrorState
          message={requestFailureMessage(error, 'Could not load this application. Please try again.')}
          onRetry={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  if (isLoading || !job || !id) {
    return (
      <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
        <View className="p-5">
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <JobForm mode="edit" jobId={id} initialJob={job} />
    </SafeAreaView>
  );
}
