'use client';

import { Button } from '@brika/clay/components/button';
import { toast } from '@brika/clay/components/toast';

export function ToastDefaultDemo() {
  return (
    <Button
      onClick={() =>
        toast('Scheduled', {
          description: 'Friday, March 8 at 5:57 PM',
        })
      }
    >
      Show toast
    </Button>
  );
}

export function ToastVariantsDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() =>
          toast('Update available', {
            description: 'A new version of the app is ready.',
            action: { label: 'Reload', onClick: () => undefined },
          })
        }
      >
        Show with action
      </Button>
      <Button
        variant="destructive"
        onClick={() =>
          toast.error('Something went wrong', {
            description: 'Your changes could not be saved.',
          })
        }
      >
        Show destructive
      </Button>
    </div>
  );
}
