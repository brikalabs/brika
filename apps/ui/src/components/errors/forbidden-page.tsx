import { ShieldX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ErrorLayout } from './error-layout';

/**
 * 403 — Access denied (missing scopes).
 */
export function ForbiddenPage({
  variant,
}: Readonly<{
  variant?: 'fullscreen' | 'inline';
}>) {
  const { t } = useTranslation();

  return (
    <ErrorLayout
      icon={ShieldX}
      code="403"
      title={t('common:errors.403.title')}
      description={t('common:errors.403.description')}
      iconClassName="bg-destructive/10 text-destructive"
      variant={variant}
    />
  );
}
