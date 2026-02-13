import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';

export function WorkflowTableSkeleton({ rows = 5 }: { rows?: number }) {
  const { t } = useLocale();

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">{t('workflows:table.name')}</TableHead>
            <TableHead>{t('workflows:table.status')}</TableHead>
            <TableHead>{t('workflows:table.blocks')}</TableHead>
            <TableHead>{t('workflows:table.startedAt')}</TableHead>
            <TableHead className="w-[180px] text-right">{t('workflows:table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRow key={`workflow-row-${i}`}>
              <TableCell>
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <Skeleton className="size-7 rounded-lg" />
                  <Skeleton className="size-7 rounded-lg" />
                  <Skeleton className="size-7 rounded-lg" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-16" />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <Skeleton className="size-8 rounded-md" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
