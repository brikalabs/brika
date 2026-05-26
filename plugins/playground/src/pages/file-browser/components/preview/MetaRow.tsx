import { CopyChip } from './CopyChip';

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
        {copy && <CopyChip value={copy} label={label.toLowerCase()} />}
      </dd>
    </div>
  );
}
