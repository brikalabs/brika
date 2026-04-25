import { Button } from '@brika/clay/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@brika/clay/components/popover';

export function PopoverDefaultDemo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>Open popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-clay-default text-sm">
          Popovers are anchored to a trigger and floated above content.
        </p>
      </PopoverContent>
    </Popover>
  );
}
