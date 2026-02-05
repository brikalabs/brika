import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui';

interface ActionButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'outline' | 'destructive';
}

export function ActionButton({
  icon: Icon,
  tooltip,
  onClick,
  disabled,
  variant = 'outline',
}: ActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant={variant} onClick={onClick} disabled={disabled}>
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
