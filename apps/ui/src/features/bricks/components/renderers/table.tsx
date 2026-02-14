import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';

const alignClass = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const;

defineRenderer('table', ({ node, onAction }) => {
  const rows = node.maxRows ? node.rows.slice(0, node.maxRows) : node.rows;
  const clickable = !!node.onRowPress;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {node.columns.map((col) => (
            <TableHead
              key={col.key}
              className={cn('text-xs', alignClass[col.align ?? 'left'])}
              style={col.width ? { width: col.width } : undefined}
            >
              {col.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow
            key={i}
            className={cn(
              node.striped && i % 2 === 1 && 'bg-muted/30',
              clickable && 'cursor-pointer'
            )}
            onClick={
              clickable ? () => onAction?.(node.onRowPress as string, { index: i, row }) : undefined
            }
          >
            {node.columns.map((col) => (
              <TableCell
                key={col.key}
                className={cn(
                  node.compact ? 'py-1 text-xs' : 'text-sm',
                  alignClass[col.align ?? 'left']
                )}
              >
                {row[col.key] ?? ''}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});
