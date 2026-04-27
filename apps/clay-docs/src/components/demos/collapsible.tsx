import { Button } from '@brika/clay/components/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@brika/clay/components/collapsible';
import { ChevronDown } from 'lucide-react';

export function CollapsibleDefaultDemo() {
  return (
    <Collapsible className="w-full max-w-xs space-y-2">
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          Toggle details
          <ChevronDown size={14} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="rounded border border-clay-hairline bg-clay-base p-3 text-clay-default text-sm">
        Hidden content. Click the trigger again to collapse.
      </CollapsibleContent>
    </Collapsible>
  );
}
