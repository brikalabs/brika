import { Link } from '@tanstack/react-router';
import type { VariantProps } from 'class-variance-authority';
import { ArrowRight } from 'lucide-react';
import type React from 'react';
import { Avatar, AvatarFallback, Card, cardVariants } from '@/components/ui';

export type Accent = VariantProps<typeof cardVariants>['accent'];

export interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  subValue?: string;
  href: string;
  accent: Accent;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  href,
  accent,
}: Readonly<StatCardProps>) {
  return (
    <Link to={href}>
      <Card accent={accent} interactive className="h-full p-5">
        <div className="relative flex h-full flex-col justify-center">
          <Avatar className="absolute top-0 right-0 size-9 bg-accent/10 text-accent">
            <AvatarFallback className="bg-accent/10 text-accent">
              <Icon className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div className="pr-10 font-bold text-3xl tracking-tight">{value}</div>
          <div className="mt-1 flex min-w-0 items-center gap-1 text-muted-foreground text-sm transition-colors group-hover:text-foreground">
            <span className="truncate">
              {subValue && <span className="font-medium">{subValue} </span>}
              {label}
            </span>
            <ArrowRight className="size-3 shrink-0 -translate-x-2 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
