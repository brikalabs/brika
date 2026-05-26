import { CodeBlockCopyButton } from '@brika/sdk/ui-kit';

interface MetaRowProps {
  label: string;
  value: string;
  mono?: boolean;
  copy?: string;
}

export function MetaRow({ label, value, mono, copy }: Readonly<MetaRowProps>) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-baseline gap-3 py-1.5">
      <dt className="font-mono text-[10px] text-muted-foreground/80 uppercase tracking-[0.14em]">
        {label}
      </dt>
      <dd className="flex min-w-0 items-baseline gap-2">
        <span
          className={`min-w-0 flex-1 truncate text-foreground/90 text-xs ${mono ? 'font-mono' : ''}`}
          title={value}
        >
          {value}
        </span>
        {copy && (
          <CodeBlockCopyButton
            value={copy}
            variant="ghost"
            size="icon-xs"
            className="size-5 shrink-0 [&_svg]:size-3"
            copyLabel={`Copy ${label.toLowerCase()}`}
            copiedLabel={`${label} copied`}
          />
        )}
      </dd>
    </div>
  );
}
