import { Button } from '@brika/clay/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@brika/clay/components/sheet';

export function SheetDefaultDemo() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Open sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Refine the list using these controls.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}
