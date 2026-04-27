'use client';

import { Button } from '@brika/clay/components/button';
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  Toaster,
  ToastProvider,
  ToastTitle,
} from '@brika/clay/components/toast';
import * as React from 'react';

export function ToastDefaultDemo() {
  const [open, setOpen] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => {
    return () => {
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <ToastProvider>
      <Button
        onClick={() => {
          setOpen(false);
          if (timerRef.current !== undefined) {
            clearTimeout(timerRef.current);
          }
          timerRef.current = setTimeout(() => setOpen(true), 50);
        }}
      >
        Show toast
      </Button>
      <Toast open={open} onOpenChange={setOpen}>
        <div className="grid gap-1">
          <ToastTitle>Scheduled</ToastTitle>
          <ToastDescription>Friday, March 8 at 5:57 PM</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
      <Toaster />
    </ToastProvider>
  );
}

export function ToastVariantsDemo() {
  const [defaultOpen, setDefaultOpen] = React.useState(false);
  const [destructiveOpen, setDestructiveOpen] = React.useState(false);
  const defaultTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const destructiveTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => {
    return () => {
      if (defaultTimerRef.current !== undefined) {
        clearTimeout(defaultTimerRef.current);
      }
      if (destructiveTimerRef.current !== undefined) {
        clearTimeout(destructiveTimerRef.current);
      }
    };
  }, []);

  return (
    <ToastProvider>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setDefaultOpen(false);
            if (defaultTimerRef.current !== undefined) {
              clearTimeout(defaultTimerRef.current);
            }
            defaultTimerRef.current = setTimeout(() => setDefaultOpen(true), 50);
          }}
        >
          Show with action
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            setDestructiveOpen(false);
            if (destructiveTimerRef.current !== undefined) {
              clearTimeout(destructiveTimerRef.current);
            }
            destructiveTimerRef.current = setTimeout(() => setDestructiveOpen(true), 50);
          }}
        >
          Show destructive
        </Button>
      </div>
      <Toast open={defaultOpen} onOpenChange={setDefaultOpen}>
        <div className="grid gap-1">
          <ToastTitle>Update available</ToastTitle>
          <ToastDescription>A new version of the app is ready.</ToastDescription>
        </div>
        <ToastAction altText="Reload to apply update">Reload</ToastAction>
        <ToastClose />
      </Toast>
      <Toast variant="destructive" open={destructiveOpen} onOpenChange={setDestructiveOpen}>
        <div className="grid gap-1">
          <ToastTitle>Something went wrong</ToastTitle>
          <ToastDescription>Your changes could not be saved.</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
      <Toaster />
    </ToastProvider>
  );
}
