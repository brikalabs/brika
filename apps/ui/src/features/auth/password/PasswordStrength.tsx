import { cn } from '@brika/clay';
import { Check, X } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';

interface Rule {
  key: string;
  test: (v: string) => boolean;
}

const RULES: Rule[] = [
  {
    key: 'minLength',
    test: (v) => v.length >= 8,
  },
  {
    key: 'uppercase',
    test: (v) => /[A-Z]/.test(v),
  },
  {
    key: 'number',
    test: (v) => /\d/.test(v),
  },
  {
    key: 'special',
    test: (v) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(v),
  },
];

export function PasswordStrength({
  password,
}: Readonly<{
  password: string;
}>) {
  const { t } = useLocale();

  if (password.length === 0) {
    return null;
  }

  const passed = RULES.filter((r) => r.test(password)).length;
  const ratio = passed / RULES.length;

  function strengthColor(): string {
    if (ratio <= 0.5) {
      return 'bg-destructive';
    }
    if (ratio < 1) {
      return 'bg-amber-500';
    }
    return 'bg-emerald-500';
  }

  return (
    <div className="space-y-2.5">
      {/* Strength bar */}
      <div className="flex gap-1">
        {RULES.map((_, i) => (
          <div
            key={`bar-${_.key}`}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i < passed ? strengthColor() : 'bg-muted'
            )}
          />
        ))}
      </div>

      {/* Rule checklist */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
        {RULES.map((rule) => {
          const met = rule.test(password);
          return (
            <li
              key={rule.key}
              className={cn(
                'flex items-center gap-1.5 text-xs transition-colors',
                met ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
              )}
            >
              {met ? <Check className="size-3" /> : <X className="size-3" />}
              {t(`auth:password.rules.${rule.key}`)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
