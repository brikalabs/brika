import { ScrollArea } from '@brika/clay/components/scroll-area';

export function ScrollAreaDefaultDemo() {
  const items = Array.from({ length: 30 }, (_, index) => `Row ${index + 1}`);
  return (
    <ScrollArea className="h-48 w-64 rounded border border-clay-hairline bg-clay-elevated">
      <ul className="divide-y divide-clay-hairline">
        {items.map((item) => (
          <li key={item} className="px-3 py-2 text-clay-default text-sm">
            {item}
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
