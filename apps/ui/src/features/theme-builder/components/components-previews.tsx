/**
 * Per-component live previews used inside the Components editor.
 *
 * Inline primitives (Button, Input, Select trigger, Tabs, Badge, Switch,
 * Card, Avatar) render the **real** `@brika/clay` components — so
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
  CodeBlock,
  CodeBlockContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PasswordInput,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Slider,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@brika/clay';
import {
  Bell,
  Check,
  Inbox,
  LayoutDashboard,
  Search,
  Settings,
  Sparkles,
  User,
} from 'lucide-react';
import { useState } from 'react';

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

/* ─── Form controls ──────────────────────────────────────────── */

export function TextareaPreview() {
  return <Textarea placeholder="Type a message…" className="h-16 w-56 text-xs" />;
}

export function PasswordInputPreview() {
  return <PasswordInput placeholder="••••••••" className="h-8 w-48 text-xs" />;
}

export function SliderPreview() {
  const [value, setValue] = useState(0.5);
  return (
    <div className="w-56">
      <Slider value={value} onChange={setValue} min={0} max={1} step={0.01} />
    </div>
  );
}

export function SwitchThumbPreview() {
  return <Switch defaultChecked />;
}

/* ─── Surfaces & data ────────────────────────────────────────── */

export function ProgressPreview() {
  return (
    <div className="w-56 space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">Uploading</Label>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">62%</span>
      </div>
      <Progress value={62} />
    </div>
  );
}

export function SeparatorPreview() {
  return (
    <div className="flex w-56 flex-col gap-1">
      <span className="text-[11px] text-foreground">Section A</span>
      <Separator />
      <span className="text-[11px] text-muted-foreground">Section B</span>
    </div>
  );
}

export function CodeBlockPreview() {
  return (
    <CodeBlock className="w-72 text-[10px]">
      <CodeBlockContent language="ts">{`const brika = () => ({\n  theme: 'custom',\n});`}</CodeBlockContent>
    </CodeBlock>
  );
}

export function TablePreview() {
  return (
    <Table className="w-72 text-[11px]">
      <TableHeader>
        <TableRow>
          <TableHead>Plugin</TableHead>
          <TableHead className="text-right">Version</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>weather</TableCell>
          <TableCell className="text-right font-mono">1.4.0</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>spotify</TableCell>
          <TableCell className="text-right font-mono">0.9.2</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>timer</TableCell>
          <TableCell className="text-right font-mono">2.0.1</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

/* ─── Sheet (open-state surface only, like DialogPreview) ────── */

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

/* ─── Sidebar (mini app rail) ────────────────────────────────── */

export function SidebarPreview() {
  return (
    <div className="flex w-44 flex-col gap-1 rounded-container border bg-sidebar p-2 text-sidebar-foreground">
      <div className="px-1.5 py-1 font-semibold text-[10px] text-sidebar-foreground/70 uppercase tracking-wider">
        Workspace
      </div>
      <div className="flex items-center gap-2 rounded-control bg-sidebar-accent px-2 py-1 text-[11px] text-sidebar-accent-foreground">
        <LayoutDashboard className="size-3.5" /> Dashboard
      </div>
      <div className="flex items-center gap-2 rounded-control px-2 py-1 text-[11px]">
        <Inbox className="size-3.5" /> Inbox
      </div>
      <div className="flex items-center gap-2 rounded-control px-2 py-1 text-[11px]">
        <Settings className="size-3.5" /> Settings
      </div>
    </div>
  );
}

/* ─── Icon palette (one swatch per --icon-* slot) ────────────── */

export function IconPreview() {
  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col items-center gap-1">
        <Search className="size-4 text-icon" />
        <span className="text-[9px] text-muted-foreground">default</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Search className="size-4 text-icon-muted" />
        <span className="text-[9px] text-muted-foreground">muted</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Search className="size-4 text-icon-primary" />
        <span className="text-[9px] text-muted-foreground">primary</span>
      </div>
    </div>
  );
}
