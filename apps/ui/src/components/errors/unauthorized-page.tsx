import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ErrorLayout } from './error-layout';

/**
 * 401 — Session expired.
 * Shown briefly before the auth interceptor redirects to login.
 */
export function UnauthorizedPage({ variant }: Readonly<{ variant?: 'fullscreen' | 'inline' }>) {
  const { t } = useTranslation();

  return (
    <ErrorLayout
      icon={Lock}
      code="401"
      title={t('common:errors.401.title')}
      description={t('common:errors.401.description')}
      iconClassName="bg-amber-500/10 text-amber-500"
      variant={variant}
    />
  );
}
