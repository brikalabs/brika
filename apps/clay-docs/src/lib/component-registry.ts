/**
 * Docs-side composition of the component catalogue.
 *
 * Discovery is pure runtime: Vite resolves `import.meta.glob` at build
 * time against Clay's source tree (the workspace path resolves through
 * because `@brika/clay`'s `exports` map points at raw TS). Every
 * component folder ships a `meta.ts`; this file globs them in and
 * composes them with docs-only data (demos, accessibility, tokens) keyed
 * by slug. Adding a new component is zero edits here — only adding
 * demos / accessibility / tokens needs an entry below.
 */

import type { ComponentGroup, ComponentMeta } from '@brika/clay';

export type { ComponentGroup } from '@brika/clay';

interface MetaModule {
  readonly meta: ComponentMeta;
}

const metaModules = import.meta.glob<MetaModule>(
  '../../../../packages/clay/src/components/*/meta.ts',
  { eager: true }
);

const CLAY_COMPONENTS: readonly ComponentMeta[] = Object.values(metaModules)
  .map((m) => m.meta)
  .sort((a, b) => a.name.localeCompare(b.name));

export interface ComponentDemo {
  /** Exported function name from the demo file (must end in `Demo`). */
  readonly name: string;
  /** Section heading rendered above the demo. */
  readonly title: string;
  /** Optional explanatory text rendered between heading and demo. */
  readonly description?: string;
  /** Code snippet shown under the demo. */
  readonly code: string;
}

export interface ComponentDocs {
  readonly demos: readonly ComponentDemo[];
  /** Optional accessibility callouts rendered as bullets. */
  readonly accessibility?: readonly string[];
  /** Tokens this component reads from the theme. */
  readonly tokens?: readonly string[];
}

export interface ComponentEntry extends ComponentMeta, ComponentDocs {
  /** Folder slug — kept as a separate key for the dynamic route. */
  readonly slug: string;
  /** Alias kept for templates that read `name` (was `displayName` upstream). */
  readonly name: string;
}

/** Compact form for the common case: one demo named "Default". */
function singleDefault(demoName: string, code: string): ComponentDocs {
  return { demos: [{ name: demoName, title: 'Default', code }] };
}

const DOCS_DATA: Readonly<Record<string, ComponentDocs>> = {
  button: {
    demos: [
      {
        name: 'ButtonDefaultDemo',
        title: 'Default',
        description: 'Solid fill. Use for the main call-to-action on a page or dialog.',
        code: '<Button>Save changes</Button>',
      },
      {
        name: 'ButtonVariantsDemo',
        title: 'Variants',
        description: 'Six variants, ordered by emphasis.',
        code: `<Button>Default</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>`,
      },
      {
        name: 'ButtonSizesDemo',
        title: 'Sizes',
        description: `\`xs\`, \`sm\`, \`default\`, \`lg\` for text; matching \`icon-*\` for icon-only.`,
        code: `<Button size="xs">XS</Button>
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>`,
      },
      {
        name: 'ButtonIconDemo',
        title: 'Icon-only',
        description: `Always supply an \`aria-label\` for screen readers.`,
        code: `<Button size="icon" aria-label="Settings">
  <SettingsIcon />
</Button>`,
      },
    ],
    accessibility: [
      `Focus-visible ring uses the \`--ring\` token for WCAG contrast.`,
      `\`disabled\` reduces opacity and blocks pointer events.`,
      `Icon-only buttons REQUIRE an \`aria-label\`.`,
    ],
    tokens: ['primary', 'primary-foreground', 'destructive', 'secondary', 'accent', 'ring'],
  },
  input: {
    demos: [
      {
        name: 'InputDefaultDemo',
        title: 'Default',
        code: '<Input placeholder="Type something…" />',
      },
      {
        name: 'InputTypesDemo',
        title: 'Types',
        description: `Every native \`type\` passes through.`,
        code: `<Input type="email" placeholder="you@example.com" />
<Input type="number" placeholder="42" />
<Input type="search" placeholder="Search…" />`,
      },
      {
        name: 'InputInvalidDemo',
        title: 'Invalid',
        description: `Set \`aria-invalid="true"\` to surface a validation error.`,
        code: '<Input aria-invalid="true" defaultValue="not a valid value" />',
      },
      {
        name: 'InputDisabledDemo',
        title: 'Disabled',
        code: '<Input disabled placeholder="Disabled" />',
      },
    ],
    tokens: ['input', 'background', 'foreground', 'muted-foreground', 'ring', 'destructive'],
  },
  card: {
    demos: [
      {
        name: 'CardDefaultDemo',
        title: 'Default',
        code: `<Card>
  <CardHeader>
    <CardTitle>Welcome to Clay</CardTitle>
    <CardDescription>Pressable raw material.</CardDescription>
  </CardHeader>
  <CardContent>Build UI with tokens that travel between apps.</CardContent>
</Card>`,
      },
      {
        name: 'CardAccentDemo',
        title: 'Accent colours',
        description: `Six accents keyed to the theme \`--data-*\` scale.`,
        code: '<Card accent="emerald">…</Card>',
      },
      {
        name: 'CardInteractiveDemo',
        title: 'Interactive',
        description: `Hover lift. Add your own \`role="button"\` or wrap in \`<a>\` for full interactivity.`,
        code: '<Card interactive>…</Card>',
      },
    ],
    tokens: ['card', 'card-foreground', 'border', 'data-1', 'data-2', 'data-3'],
  },
  label: singleDefault(
    'LabelDefaultDemo',
    `<Label htmlFor="email">Email</Label>
<Input id="email" type="email" />`
  ),
  badge: {
    demos: [
      {
        name: 'BadgeDefaultDemo',
        title: 'Default',
        code: '<Badge>New</Badge>',
      },
      {
        name: 'BadgeVariantsDemo',
        title: 'Variants',
        code: `<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
<Badge variant="outline">Outline</Badge>`,
      },
    ],
  },
  separator: {
    demos: [
      {
        name: 'SeparatorDefaultDemo',
        title: 'Horizontal',
        code: '<Separator />',
      },
      {
        name: 'SeparatorVerticalDemo',
        title: 'Vertical',
        code: '<Separator orientation="vertical" />',
      },
    ],
  },
  avatar: {
    demos: [
      {
        name: 'AvatarDefaultDemo',
        title: 'Default',
        code: `<Avatar>
  <AvatarImage src="…" />
  <AvatarFallback>JD</AvatarFallback>
</Avatar>`,
      },
      {
        name: 'AvatarFallbackDemo',
        title: 'Fallback',
        description: 'When the image fails or is omitted, the fallback initials show.',
        code: `<Avatar>
  <AvatarFallback>AB</AvatarFallback>
</Avatar>`,
      },
      {
        name: 'AvatarGroupDemo',
        title: 'Group',
        code: `<AvatarGroup>
  <Avatar>...</Avatar>
  <Avatar>...</Avatar>
  <AvatarGroupCount count={3} />
</AvatarGroup>`,
      },
    ],
  },
  switch: {
    demos: [
      {
        name: 'SwitchDefaultDemo',
        title: 'Default',
        code: '<Switch />',
      },
      {
        name: 'SwitchControlledDemo',
        title: 'Controlled',
        code: '<Switch checked={value} onCheckedChange={setValue} />',
      },
    ],
  },
  skeleton: {
    demos: [
      {
        name: 'SkeletonDefaultDemo',
        title: 'Default',
        code: '<Skeleton className="h-4 w-48" />',
      },
      {
        name: 'SkeletonCardDemo',
        title: 'Card placeholder',
        code: `<div className="flex items-center gap-3">
  <Skeleton className="size-10 rounded-full" />
  <div className="flex flex-col gap-2">
    <Skeleton className="h-4 w-32" />
    <Skeleton className="h-3 w-24" />
  </div>
</div>`,
      },
    ],
  },
  progress: singleDefault('ProgressDefaultDemo', '<Progress value={66} />'),
  'progress-display': singleDefault(
    'ProgressDisplayDefaultDemo',
    '<ProgressDisplay label="Uploading" value={66} />'
  ),
  textarea: singleDefault('TextareaDefaultDemo', '<Textarea placeholder="Tell us more…" />'),
  'password-input': singleDefault(
    'PasswordInputDefaultDemo',
    '<PasswordInput placeholder="Enter password" />'
  ),
  slider: {
    demos: [
      {
        name: 'SliderDefaultDemo',
        title: 'Default',
        description: `Slider is just the track. Compose it with \`SliderValue\` when you want a boxed numeric readout — both bind to the same \`value\` / \`onChange\`.`,
        code: `<div className="flex items-center gap-2">
  <Slider value={value} onChange={setValue} min={0} max={100} step={1} className="flex-1" />
  <SliderValue value={value} onChange={setValue} min={0} max={100} step={1} unit="%" />
</div>`,
      },
      {
        name: 'SliderStepDotsDemo',
        title: 'Step dots',
        description: `\`ticks\` set to \`true\` renders one dot per \`step\` between min and max; \`tickLabels\` shows the value below each dot. Endpoints are skipped so they don't collide with the thumb.`,
        code: '<Slider value={value} onChange={setValue} min={0} max={10} step={1} ticks tickLabels />',
      },
      {
        name: 'SliderStepIntervalDemo',
        title: 'Custom interval',
        description: `Pass a number to space dots independently of \`step\`. Here \`step={1}\` still controls keyboard increments while dots appear every 2 units.`,
        code: '<Slider value={value} onChange={setValue} min={0} max={20} step={1} ticks={2} tickLabels />',
      },
      {
        name: 'SliderCustomTicksDemo',
        title: 'Preset positions',
        description: `An explicit array marks arbitrary anchor values — useful for plan tiers, durations, or non-uniform presets. Pass a function to \`tickLabels\` for custom formatting.`,
        code: `<Slider
  value={value}
  onChange={setValue}
  min={0}
  max={12}
  step={1}
  ticks={[1, 3, 6, 12]}
  tickLabels={(t) => \`\${t}mo\`}
/>`,
      },
    ],
    tokens: [
      'slider-track',
      'slider-fill',
      'slider-thumb',
      'slider-thumb-border',
      'slider-thumb-border-width',
      'slider-thumb-shadow',
      'slider-tick',
      'slider-tick-active',
      'slider-label',
      'slider-label-active',
      'slider-track-height',
      'slider-thumb-size',
      'slider-tick-size',
      'slider-radius',
      'slider-thumb-radius',
    ],
  },
  select: singleDefault(
    'SelectDefaultDemo',
    `<Select>
  <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="a">Option A</SelectItem>
    <SelectItem value="b">Option B</SelectItem>
  </SelectContent>
</Select>`
  ),
  tabs: singleDefault(
    'TabsDefaultDemo',
    `<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="activity">Activity</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">…</TabsContent>
  <TabsContent value="activity">…</TabsContent>
</Tabs>`
  ),
  breadcrumb: singleDefault(
    'BreadcrumbDefaultDemo',
    `<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href="/">Home</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>Settings</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>`
  ),
  dialog: singleDefault(
    'DialogDefaultDemo',
    `<Dialog>
  <DialogTrigger asChild><Button>Open</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Are you sure?</DialogTitle>
      <DialogDescription>This cannot be undone.</DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>`
  ),
  'alert-dialog': singleDefault(
    'AlertDialogDefaultDemo',
    `<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete account?</AlertDialogTitle>
      <AlertDialogDescription>This action is permanent.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>`
  ),
  sheet: singleDefault(
    'SheetDefaultDemo',
    `<Sheet>
  <SheetTrigger asChild><Button>Open</Button></SheetTrigger>
  <SheetContent>…</SheetContent>
</Sheet>`
  ),
  popover: singleDefault(
    'PopoverDefaultDemo',
    `<Popover>
  <PopoverTrigger asChild><Button>Open</Button></PopoverTrigger>
  <PopoverContent>Popover content</PopoverContent>
</Popover>`
  ),
  tooltip: singleDefault(
    'TooltipDefaultDemo',
    `<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild><Button>Hover</Button></TooltipTrigger>
    <TooltipContent>Helpful hint</TooltipContent>
  </Tooltip>
</TooltipProvider>`
  ),
  'dropdown-menu': singleDefault(
    'DropdownMenuDefaultDemo',
    `<DropdownMenu>
  <DropdownMenuTrigger asChild><Button>Open</Button></DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Profile</DropdownMenuItem>
    <DropdownMenuItem>Settings</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem>Log out</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`
  ),
  collapsible: singleDefault(
    'CollapsibleDefaultDemo',
    `<Collapsible>
  <CollapsibleTrigger>Toggle</CollapsibleTrigger>
  <CollapsibleContent>Hidden content</CollapsibleContent>
</Collapsible>`
  ),
  'scroll-area': singleDefault(
    'ScrollAreaDefaultDemo',
    '<ScrollArea className="h-48 w-64">…</ScrollArea>'
  ),
  table: singleDefault(
    'TableDefaultDemo',
    `<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Email</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Jane</TableCell>
      <TableCell>jane@example.com</TableCell>
    </TableRow>
  </TableBody>
</Table>`
  ),
  chart: singleDefault('ChartDefaultDemo', '<Chart data={…} />'),
  'code-block': singleDefault(
    'CodeBlockDefaultDemo',
    `<CodeBlock language="tsx" code="<Button>Hello</Button>">
  <CodeBlockHeader />
  <CodeBlockContent />
</CodeBlock>`
  ),
  'input-group': singleDefault(
    'InputGroupDefaultDemo',
    `<InputGroup>
  <InputGroupAddon>$</InputGroupAddon>
  <InputGroupInput placeholder="0.00" />
</InputGroup>`
  ),
  'button-group': singleDefault(
    'ButtonGroupDefaultDemo',
    `<ButtonGroup>
  <Button>Bold</Button>
  <Button>Italic</Button>
  <Button>Underline</Button>
</ButtonGroup>`
  ),
  'empty-state': singleDefault(
    'EmptyStateDefaultDemo',
    `<EmptyState>
  <EmptyStateIcon><InboxIcon /></EmptyStateIcon>
  <EmptyStateTitle>No messages</EmptyStateTitle>
  <EmptyStateDescription>You're all caught up.</EmptyStateDescription>
</EmptyState>`
  ),
  'page-header': singleDefault(
    'PageHeaderDefaultDemo',
    `<PageHeader>
  <PageHeaderInfo>
    <PageHeaderTitle>Dashboards</PageHeaderTitle>
    <PageHeaderDescription>All your monitoring views in one place.</PageHeaderDescription>
  </PageHeaderInfo>
  <PageHeaderActions>
    <Button>New dashboard</Button>
  </PageHeaderActions>
</PageHeader>`
  ),
  section: singleDefault(
    'SectionDefaultDemo',
    `<Section>
  <SectionHeader>
    <SectionTitle>Connected services</SectionTitle>
    <SectionDescription>Manage integrations and API keys.</SectionDescription>
  </SectionHeader>
  <SectionContent>…</SectionContent>
</Section>`
  ),
  'section-label': singleDefault(
    'SectionLabelDefaultDemo',
    '<SectionLabel>Recent activity</SectionLabel>'
  ),
  sidebar: singleDefault(
    'SidebarDefaultDemo',
    `<SidebarProvider>
  <Sidebar>...</Sidebar>
  <SidebarTrigger />
</SidebarProvider>`
  ),
  'overflow-list': singleDefault(
    'OverflowListDefaultDemo',
    `<OverflowList>
  <OverflowListContent>...</OverflowListContent>
  <OverflowListIndicator />
</OverflowList>`
  ),
  'brika-logo': singleDefault('BrikaLogoDefaultDemo', '<BrikaLogo />'),
};

const FALLBACK_DOCS: ComponentDocs = { demos: [] };

const ENTRIES: readonly ComponentEntry[] = CLAY_COMPONENTS.map((meta) => {
  const docs = DOCS_DATA[meta.name] ?? FALLBACK_DOCS;
  return {
    slug: meta.name,
    name: meta.displayName,
    displayName: meta.displayName,
    description: meta.description,
    group: meta.group,
    demos: docs.demos,
    accessibility: docs.accessibility,
    tokens: docs.tokens,
  };
});

export const COMPONENTS: readonly ComponentEntry[] = ENTRIES;

export const COMPONENTS_BY_SLUG: Readonly<Record<string, ComponentEntry>> = Object.fromEntries(
  COMPONENTS.map((c) => [c.slug, c])
);

export const COMPONENT_GROUPS: readonly ComponentGroup[] = [
  'Primitives',
  'Forms',
  'Overlays',
  'Navigation',
  'Feedback',
  'Layout',
  'Data',
];

export function componentsInGroup(group: ComponentGroup): readonly ComponentEntry[] {
  return COMPONENTS.filter((c) => c.group === group);
}

export function adjacentComponents(slug: string): {
  readonly previous: ComponentEntry | null;
  readonly next: ComponentEntry | null;
} {
  const index = COMPONENTS.findIndex((c) => c.slug === slug);
  if (index === -1) {
    return { previous: null, next: null };
  }
  return {
    previous: index > 0 ? (COMPONENTS[index - 1] ?? null) : null,
    next: index < COMPONENTS.length - 1 ? (COMPONENTS[index + 1] ?? null) : null,
  };
}
