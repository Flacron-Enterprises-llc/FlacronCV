import { Suspense } from 'react';
import ConfirmClient from './ConfirmClient';

// Double-opt-in landing page for the link in the confirmation email.
// ConfirmClient reads ?token via useSearchParams, so it must sit in Suspense.
export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmClient />
    </Suspense>
  );
}
