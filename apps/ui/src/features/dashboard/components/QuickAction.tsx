import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import type React from 'react';
import { Avatar, AvatarFallback, Card } from '@/components/ui';
import type { Accent } from './StatCard';

export interface QuickActionProps {
  icon: React.ElementType;
  label: string;
  href: string;
  accent: Accent;
}

export function QuickAction({ icon: Icon, label, href, accent }: Readonly<QuickActionProps>) {
  return (
    <Link to={href}>
      <Card accent={accent} interactive className="p-3">
        <div className="relative flex items-center gap-3">
          <Avatar className="size-9 bg-accent/10 text-accent">
            <AvatarFallback className="bg-accent/10 text-accent">
              <Icon className="size-4" />
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-sm transition-colors group-hover:text-foreground">
            {label}
          </span>
          <ArrowRight className="ml-auto size-4 -translate-x-2 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        </div>
      </Card>
    </Link>
  );
}
