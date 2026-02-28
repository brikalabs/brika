import { useAuth } from '@brika/auth/react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

interface UserAvatarProps {
  user: { id: string; name: string; avatarHash?: string | null };
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

const PX = { sm: 32, default: 40, lg: 64 } as const;

export function UserAvatar({ user, size = 'default', className }: Readonly<UserAvatarProps>) {
  const { client } = useAuth();
  const initials = user.name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);

  return (
    <Avatar size={size} className={className}>
      <AvatarImage src={client.avatarUrl(user, { size: PX[size] })} alt={user.name} />
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}
