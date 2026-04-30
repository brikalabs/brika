/**
 * Overlay-surface previews — alert, toast, dialog, popover, menu, tooltip,
 * sheet. Portalled components are rendered as their **open-state surface
 * only**: a single card with the same utility classes Radix emits on its
 * `Content`. No triggers, no portals, no positioning gymnastics.
 */

import {
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Separator,
} from '@brika/clay';
import { Bell, Settings, Sparkles, User } from 'lucide-react';

export function AlertPreview() {
  return (
    <div className="w-64 rounded-alert border bg-background p-2.5 text-foreground">
      <div className="flex items-start gap-2">
        <div className="mt-1 size-2 shrink-0 rounded-full bg-info" />
        <div className="min-w-0 flex-1">
          <Label className="text-xs">Heads up</Label>
          <div className="text-[10px] text-muted-foreground">This is an informational alert.</div>
        </div>
      </div>
    </div>
  );
}

export function ToastPreview() {
  return (
    <div className="w-64 rounded-toast border bg-background p-2.5 shadow-toast">
      <Label className="text-xs">Saved</Label>
      <div className="text-[10px] text-muted-foreground">Your changes were persisted.</div>
    </div>
  );
}

export function DialogPreview() {
  return (
    <div className="corner-dialog flex w-72 flex-col gap-4 rounded-dialog border bg-dialog-container p-4 text-dialog-label shadow-dialog">
      <DialogHeader>
        <DialogTitle className="text-sm">Confirm action</DialogTitle>
        <DialogDescription className="text-xs">
          This will replace the selection with your draft. It cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2">
        <Button size="xs" variant="ghost">
          Cancel
        </Button>
        <Button size="xs">Confirm</Button>
      </DialogFooter>
    </div>
  );
}

export function AlertDialogPreview() {
  return (
    <div className="corner-dialog flex w-72 flex-col gap-4 rounded-dialog border bg-dialog-container p-4 shadow-dialog">
      <AlertDialogHeader>
        <AlertDialogTitle className="text-sm">Delete theme?</AlertDialogTitle>
        <AlertDialogDescription className="text-xs">
          This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="gap-2">
        <Button size="xs" variant="ghost">Cancel</Button>
        <Button size="xs" variant="destructive">Delete</Button>
      </AlertDialogFooter>
    </div>
  );
}

export function PopoverPreview() {
  return (
    <div className="corner-popover w-56 rounded-popover border bg-popover p-3 text-popover-foreground shadow-popover">
      <Label className="text-xs">Quick settings</Label>
      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
        Floating surface anchored to its trigger. Themed through the preview.
      </p>
    </div>
  );
}

export function MenuPreview() {
  return (
    <div className="corner-menu w-44 space-y-0.5 rounded-menu border bg-popover p-1 text-popover-foreground shadow-menu">
      <div className="corner-menu-item flex items-center gap-2 rounded-menu-item bg-accent px-2 py-1.5 text-accent-foreground text-xs">
        <User className="size-3.5" /> Profile
      </div>
      <div className="corner-menu-item flex items-center gap-2 rounded-menu-item px-2 py-1.5 text-xs">
        <Bell className="size-3.5" /> Notifications
      </div>
      <div className="-mx-1 my-1 h-px bg-border" />
      <div className="corner-menu-item flex items-center gap-2 rounded-menu-item px-2 py-1.5 text-xs">
        <Settings className="size-3.5" /> Settings
      </div>
    </div>
  );
}

export function MenuItemPreview() {
  return (
    <div className="corner-menu w-44 space-y-0.5 rounded-menu border bg-popover p-1 shadow-menu">
      <div className="corner-menu-item flex items-center gap-2 rounded-menu-item bg-accent px-2 py-1.5 text-accent-foreground text-xs">
        <Sparkles className="size-3.5" /> Hovered
      </div>
      <div className="corner-menu-item flex items-center gap-2 rounded-menu-item px-2 py-1.5 text-popover-foreground text-xs">
        Idle
      </div>
    </div>
  );
}

export function TooltipPreview() {
  return (
    <div className="corner-tooltip inline-flex items-center rounded-tooltip bg-foreground px-3 py-1.5 text-background text-xs shadow-tooltip">
      Tooltip text
    </div>
  );
}

export function SheetPreview() {
  return (
    <div className="flex w-72 flex-col gap-3 rounded-sheet border bg-popover p-4 text-popover-foreground shadow-sheet">
      <div className="space-y-0.5">
        <div className="font-semibold text-xs">Notifications</div>
        <div className="text-[10px] text-muted-foreground">
          Recent activity from your workspace.
        </div>
      </div>
      <Separator />
      <div className="flex items-start gap-2 text-[10px]">
        <Bell className="size-3.5 text-info" />
        <div>
          <div className="text-foreground">New plugin available</div>
          <div className="text-muted-foreground">2 minutes ago</div>
        </div>
      </div>
    </div>
  );
}
