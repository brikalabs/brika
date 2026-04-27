import { Badge } from '@brika/clay';
import { useLocale } from '@/lib/use-locale';

const ROLE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  admin: 'default',
  user: 'secondary',
  guest: 'outline',
  service: 'outline',
};

export function UserRoleBadge({
  role,
}: Readonly<{
  role: string;
}>) {
  const { t } = useLocale();

  return <Badge variant={ROLE_VARIANT[role] ?? 'outline'}>{t(`users:roles.${role}`)}</Badge>;
}
