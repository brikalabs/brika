import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ErrorLayout } from './error-layout';

/**
 * Generic / unknown error fallback with a retry action.
 */
export function GenericErrorPage({ variant, onRetry, error }: Readonly<{
  variant?: 'fullscreen' | 'inline';
  onRetry?: () => void;
  error?: Error | null;
}>) {
  const { t } = useTranslation();

  return (
    <ErrorLayout
      icon={AlertTriangle}
      title={t('common:errors.generic.title')}
      description={t('common:errors.generic.description')}
      iconClassName="bg-amber-500/10 text-amber-500"
      variant={variant}
      onRetry={onRetry}
      error={error}
    />
  );
}
