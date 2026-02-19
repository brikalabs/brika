import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { defineRenderer } from './registry';

const BrickChart = lazy(() => import('../BrickChart').then((m) => ({ default: m.BrickChart })));

defineRenderer('chart', ({ node }) => (
  <Suspense fallback={<Skeleton className="h-full w-full" />}>
    <BrickChart node={node} />
  </Suspense>
));
