import { ChevronRight, HardDrive } from '@brika/sdk/ui-kit/icons';

const ROOT_LABEL = 'data';

/**
 * Breadcrumb that doubles as the toolbar title. Root segment carries a
 * drive icon + a monospace `/data` chip so the technical context is
 * always one glance away; intermediate segments are hover-able pills
 * that read as plain words.
 */
export function Breadcrumb({
  path,
  onNavigate,
}: Readonly<{ path: string; onNavigate: (path: string) => void }>) {
  const segments = path.split('/').filter(Boolean);
  const isAtRoot = segments.length <= 1;

  return (
    <nav className="flex min-w-0 items-center gap-1 text-sm" aria-label="File path">
      {segments.map((seg, idx) => {
        const segPath = `/${segments.slice(0, idx + 1).join('/')}`;
        const isLast = idx === segments.length - 1;
        const isRoot = idx === 0;
        const label = isRoot ? ROOT_LABEL : seg;

        return (
          <span key={segPath} className="flex min-w-0 items-center gap-1">
            {!isRoot && (
              <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/40" />
            )}
            {isLast ? (
              <span className="flex min-w-0 items-center gap-2">
                {isRoot && (
                  <HardDrive aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate font-semibold text-foreground">{label}</span>
                {isAtRoot && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    /data
                  </span>
                )}
              </span>
            ) : (
              <button
                type="button"
                className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => onNavigate(segPath)}
              >
                {isRoot && <HardDrive aria-hidden className="size-3.5 shrink-0" />}
                <span className="truncate">{label}</span>
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
