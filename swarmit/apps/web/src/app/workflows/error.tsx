'use client';

import { ErrorFallback } from '@/components/ErrorFallback';

export default function WorkflowsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback error={error} reset={reset} />;
}
