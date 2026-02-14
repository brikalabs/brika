import { LayoutDashboard } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { Avatar, AvatarFallback, Input, Label } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';

interface BoardFormFieldsProps {
  name: string;
  icon: string;
  onNameChange: (name: string) => void;
  onSubmit?: () => void;
  inputId?: string;
}

export function BoardFormFields({
  name,
  icon,
  onNameChange,
  onSubmit,
  inputId = 'board-name',
}: Readonly<BoardFormFieldsProps>) {
  const { t } = useLocale();

  return (
    <div className="flex items-center gap-3">
      <Avatar size="lg">
        <AvatarFallback>
          {icon ? (
            <DynamicIcon name={icon as IconName} className="size-5" fallback={() => null} />
          ) : (
            <LayoutDashboard className="size-5" />
          )}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <Label htmlFor={inputId} className="sr-only">
          {t('common:labels.name')}
        </Label>
        <Input
          id={inputId}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
          placeholder={t('common:labels.name')}
          className="text-base font-medium"
        />
      </div>
    </div>
  );
}
