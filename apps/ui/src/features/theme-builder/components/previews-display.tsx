/**
 * Display & layout previews — cards, avatars, progress, tables, sidebars,
 * charts, breadcrumbs, sections, etc. Each preview renders the **real**
 * `@brika/clay` component so theme tweaks ripple through automatically.
 */

import {
  Avatar,
  AvatarFallback,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Chart,
  CodeBlock,
  CodeBlockContent,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
  Label,
  PageHeader,
  PageHeaderDescription,
  PageHeaderInfo,
  PageHeaderTitle,
  Progress,
  ScrollArea,
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionInfo,
  SectionLabel,
  SectionTitle,
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@brika/clay';
import { AlertTriangle, ChevronDown, Inbox, LayoutDashboard, Search, Settings } from 'lucide-react';

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

/** One swatch per --icon-* slot. */
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

const CHART_DATA = [
  { ts: 1, value: 28 },
  { ts: 2, value: 52 },
  { ts: 3, value: 38 },
  { ts: 4, value: 74 },
  { ts: 5, value: 60 },
  { ts: 6, value: 88 },
];

export function ChartPreview() {
  return <Chart data={CHART_DATA} className="h-24 w-56" />;
}

export function SkeletonPreview() {
  return (
    <div className="w-48 space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}

export function ProgressDisplayPreview() {
  return (
    <div className="w-56 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Installing…</span>
        <span className="font-medium text-primary tabular-nums">65%</span>
      </div>
      <Progress value={65} className="h-1.5" />
      <div className="max-h-12 overflow-auto rounded border bg-muted/40 p-1.5 font-mono text-[9px] text-muted-foreground">
        <div>Fetching packages…</div>
        <div>Resolving dependencies…</div>
      </div>
    </div>
  );
}

export function ScrollAreaPreview() {
  const items = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
  return (
    <ScrollArea className="h-20 w-40 rounded-control border">
      <div className="p-2">
        {items.map((item) => (
          <div key={item} className="py-1 text-xs">
            {item}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

export function EmptyStatePreview() {
  return (
    <EmptyState className="w-52">
      <EmptyStateIcon>
        <Inbox className="size-5" />
      </EmptyStateIcon>
      <EmptyStateTitle className="text-sm">Nothing here</EmptyStateTitle>
      <EmptyStateDescription className="text-xs">No items found.</EmptyStateDescription>
    </EmptyState>
  );
}

export function BreadcrumbPreview() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Settings</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Themes</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function CollapsiblePreview() {
  return (
    <Collapsible defaultOpen className="w-52 rounded-control border">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 font-medium text-xs">
        Advanced options
        <ChevronDown className="size-3 text-muted-foreground" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          Hidden content now visible.
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PageHeaderPreview() {
  return (
    <PageHeader className="w-60">
      <PageHeaderInfo>
        <PageHeaderTitle>Theme Builder</PageHeaderTitle>
        <PageHeaderDescription>Customise your visual identity.</PageHeaderDescription>
      </PageHeaderInfo>
    </PageHeader>
  );
}

export function SectionPreview() {
  return (
    <Section className="w-56">
      <SectionHeader>
        <SectionInfo>
          <SectionTitle className="text-sm">Active Plugins</SectionTitle>
          <SectionDescription className="text-xs">Currently running.</SectionDescription>
        </SectionInfo>
      </SectionHeader>
      <SectionContent>
        <p className="text-[11px] text-muted-foreground">3 plugins enabled.</p>
      </SectionContent>
    </Section>
  );
}

export function SectionLabelPreview() {
  return (
    <div className="w-52 space-y-3">
      <SectionLabel>Installed</SectionLabel>
      <div className="h-px rounded bg-border" />
      <SectionLabel tone="warning" icon={AlertTriangle}>
        Needs attention
      </SectionLabel>
    </div>
  );
}

export function OverflowListPreview() {
  const tags = ['Design', 'Engineering', 'Product', '+3'];
  return (
    <div className="flex max-w-52 items-center gap-1 overflow-hidden">
      {tags.map((t, i) => (
        <Badge
          key={t}
          variant={i === tags.length - 1 ? 'secondary' : 'outline'}
          className="shrink-0 text-[10px]"
        >
          {t}
        </Badge>
      ))}
    </div>
  );
}
