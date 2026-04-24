/**
 * Per-component live previews used inside the Components editor.
 *
 * Inline primitives (Button, Input, Select trigger, Tabs, Badge, Switch,
 * Card, Avatar) render the **real** `@/components/ui` components — so
 * hover/focus/disabled states and any kit evolution show up
 * automatically.
 *
 * Portalled components (Dialog, Popover, DropdownMenu, Tooltip) are
 * shown as their **open-state surface only**: a single card with the
 * same utility classes Radix emits on its `Content` (`rounded-dialog`,
 * `bg-popover`, `corner-menu`, `shadow-tooltip`, …). No triggers, no
 * portals, no positioning gymnastics — the preview stage is about the
 * shape and colour of the surface, not the open-animation flow. Every
 * class still resolves through CSS variables so theme tweaks keep
 * rippling through.
 */

import { Bell, Check, Settings, Sparkles, User } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui';

/* ─── Inline components (real UI kit) ──────────────────────────── */

export function ButtonPreview() {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm">Primary</Button>
      <Button size="sm" variant="outline">
        Outline
      </Button>
    </div>
  );
}

export function InputPreview() {
  return <Input placeholder="Username" className="h-8 w-48 text-xs" />;
}

export function SelectPreview() {
  return (
    <Select defaultValue="option-a">
      <SelectTrigger className="h-8 w-40 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="option-a">Option A</SelectItem>
        <SelectItem value="option-b">Option B</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** No Checkbox in the kit yet — mirrors the real component's utility classes. */
export function CheckboxPreview() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-4 items-center justify-center rounded-checkbox border border-primary bg-primary text-primary-foreground">
        <Check className="size-3" />
      </div>
      <div className="size-4 rounded-checkbox border border-input" />
    </div>
  );
}

export function TabsPreview() {
  return (
    <Tabs defaultValue="active">
      <TabsList>
        <TabsTrigger value="active" className="text-xs">
          Active
        </TabsTrigger>
        <TabsTrigger value="idle" className="text-xs">
          Idle
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function BadgePreview() {
  return (
    <div className="flex items-center gap-2">
      <Badge>New</Badge>
      <Badge variant="outline">Beta</Badge>
    </div>
  );
}

export function SwitchPreview() {
  return (
    <div className="flex items-center gap-3">
      <Switch defaultChecked />
      <Switch />
    </div>
  );
}

export function CardPreview() {
  return (
    <Card className="w-64">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm">Card title</CardTitle>
        <CardDescription className="text-xs">Lorem ipsum dolor sit amet.</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-end gap-2 p-3 pt-0">
        <Button size="xs" variant="ghost">
          Cancel
        </Button>
        <Button size="xs">Save</Button>
      </CardContent>
    </Card>
  );
}

export function AvatarPreview() {
  return (
    <div className="flex items-center gap-2">
      <Avatar>
        <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
          MS
        </AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-muted font-semibold text-muted-foreground">JD</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-accent font-semibold text-accent-foreground">
          AR
        </AvatarFallback>
      </Avatar>
    </div>
  );
}

/* ─── Standalone surfaces — shared utility classes, no portal ─── */

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
