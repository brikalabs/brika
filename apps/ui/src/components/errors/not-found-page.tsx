import { FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ErrorLayout } from './error-layout';

/**
 * 404 — Page not found.
 */
export function NotFoundPage({
  variant,
}: Readonly<{
  variant?: 'fullscreen' | 'inline';
}>) {
  const { t } = useTranslation();

  return (
    <ErrorLayout
      icon={FileQuestion}
      code="404"
      title={t('common:errors.404.title')}
      description={t('common:errors.404.description')}
      iconClassName="bg-muted text-muted-foreground"
      variant={variant}
    />
  );
}
