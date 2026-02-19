import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui';
import { defineRenderer } from './registry';

const MarkdownContent = lazy(() => import('./markdown-content'));

defineRenderer('markdown', ({ node }) => (
  <Suspense fallback={<Skeleton className="h-8 w-full" />}>
    <MarkdownContent content={node.content} />
  </Suspense>
));
