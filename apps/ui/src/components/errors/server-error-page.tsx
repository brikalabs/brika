import { ServerCrash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ErrorLayout } from './error-layout';

/**
 * 500 — Server / unexpected error with a retry action.
 */
export function ServerErrorPage({ variant, onRetry, error }: Readonly<{
  variant?: 'fullscreen' | 'inline';
  onRetry?: () => void;
  error?: Error | null;
}>) {
  const { t } = useTranslation();

  return (
    <ErrorLayout
      icon={ServerCrash}
      code="500"
      title={t('common:errors.500.title')}
      description={t('common:errors.500.description')}
      iconClassName="bg-orange-500/10 text-orange-500"
      variant={variant}
      onRetry={onRetry}
      error={error}
    />
  );
}
