import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Breadcrumb as ClayBreadcrumb,
} from '@brika/sdk/ui-kit';
import { HardDrive } from '@brika/sdk/ui-kit/icons';

const ROOT_LABEL = 'data';

/**
 * Breadcrumb that doubles as the toolbar title. Built on Clay's
 * `Breadcrumb` primitives so spacing, separators, and a11y match the
 * rest of the app; the root segment carries a drive icon so the
 * technical context is always one glance away.
 */
export function Breadcrumb({
  path,
  onNavigate,
}: Readonly<{ path: string; onNavigate: (path: string) => void }>) {
  const segments = path.split('/').filter(Boolean);

  return (
    <ClayBreadcrumb aria-label="File path">
      <BreadcrumbList>
        {segments.map((seg, idx) => {
          const segPath = `/${segments.slice(0, idx + 1).join('/')}`;
          const isLast = idx === segments.length - 1;
          const isRoot = idx === 0;
          const label = isRoot ? ROOT_LABEL : seg;
          return (
            <BreadcrumbItem key={segPath}>
              {idx > 0 && <BreadcrumbSeparator />}
              {isLast ? (
                <BreadcrumbPage className="flex items-center gap-1.5 truncate font-semibold">
                  {isRoot && <HardDrive aria-hidden className="size-3.5 shrink-0" />}
                  {label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild className="flex items-center gap-1.5 truncate">
                  <button type="button" onClick={() => onNavigate(segPath)}>
                    {isRoot && <HardDrive aria-hidden className="size-3.5 shrink-0" />}
                    {label}
                  </button>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </ClayBreadcrumb>
  );
}
