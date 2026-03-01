import type { ErrorComponentProps } from '@tanstack/react-router';
import { ApiError } from '@/lib/query';
import { ForbiddenPage, GenericErrorPage, NotFoundPage, ServerErrorPage } from './errors';

/**
 * TanStack Router default error component.
 *
 * - 401 ApiError → returns null (the 401 interceptor already cleared
 *   the session, so RootLayout will render LoginPage)
 * - 403 → ForbiddenPage
 * - 404 → NotFoundPage
 * - 5xx / other → ServerErrorPage (with debug panel in dev)
 * - Non-API errors → GenericErrorPage (with debug panel in dev)
 */
export function DefaultErrorComponent({ error, reset }: ErrorComponentProps) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return null;
    }
    if (error.status === 403) {
      return <ForbiddenPage />;
    }
    if (error.status === 404) {
      return <NotFoundPage />;
    }
    return <ServerErrorPage onRetry={reset} error={error} />;
  }

  return <GenericErrorPage onRetry={reset} error={error} />;
}
