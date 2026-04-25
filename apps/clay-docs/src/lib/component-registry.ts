/**
 * The full Clay component registry.
 *
 * One entry per component. The dynamic /components/[slug] page renders from
 * this registry; the sidebar, command palette, /components index, and home
 * grid all read from it too. Adding a component = appending one entry here
 * + dropping a `<slug>.tsx` demo file into src/components/demos/.
 */

export type ComponentGroup =
  | 'Primitives'
  | 'Forms'
  | 'Overlays'
  | 'Navigation'
  | 'Feedback'
  | 'Layout'
  | 'Data';

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

export interface ComponentEntry {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly group: ComponentGroup;
  readonly demos: readonly ComponentDemo[];
  /** Optional accessibility callouts rendered as bullets. */
  readonly accessibility?: readonly string[];
  /** Tokens this component reads from the theme. */
  readonly tokens?: readonly string[];
}

export const COMPONENTS: readonly ComponentEntry[] = [
  {
    slug: 'button',
    name: 'Button',
    description:
      'The default action affordance — a themed wrapper over the native button with CVA variants and asChild slot projection.',
    group: 'Primitives',
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
        description: '`xs`, `sm`, `default`, `lg` for text; matching `icon-*` for icon-only.',
        code: `<Button size="xs">XS</Button>
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>`,
      },
      {
        name: 'ButtonIconDemo',
        title: 'Icon-only',
        description: 'Always supply an `aria-label` for screen readers.',
        code: `<Button size="icon" aria-label="Settings">
  <SettingsIcon />
</Button>`,
      },
    ],
    accessibility: [
      'Focus-visible ring uses the `--ring` token for WCAG contrast.',
      '`disabled` reduces opacity and blocks pointer events.',
      'Icon-only buttons REQUIRE an `aria-label`.',
    ],
    tokens: ['primary', 'primary-foreground', 'destructive', 'secondary', 'accent', 'ring'],
  },
  {
    slug: 'input',
    name: 'Input',
    description:
      'A themed single-line text input. Thin wrapper over the native input with tokenised styling, focus ring, and aria-invalid handling.',
    group: 'Forms',
    demos: [
      {
        name: 'InputDefaultDemo',
        title: 'Default',
        code: '<Input placeholder="Type something…" />',
      },
      {
        name: 'InputTypesDemo',
        title: 'Types',
        description: 'Every native `type` passes through.',
        code: `<Input type="email" placeholder="you@example.com" />
<Input type="number" placeholder="42" />
<Input type="search" placeholder="Search…" />`,
      },
      {
        name: 'InputInvalidDemo',
        title: 'Invalid',
        description: 'Set `aria-invalid="true"` to surface a validation error.',
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
  {
    slug: 'card',
    name: 'Card',
    description:
      'A surface container that groups related content and actions. Header / title / description / content / footer subcomponents.',
    group: 'Layout',
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
        description: 'Six accents keyed to the theme `--data-*` scale.',
        code: '<Card accent="emerald">…</Card>',
      },
      {
        name: 'CardInteractiveDemo',
        title: 'Interactive',
        description:
          'Hover lift. Add your own `role="button"` or wrap in `<a>` for full interactivity.',
        code: '<Card interactive>…</Card>',
      },
    ],
    tokens: ['card', 'card-foreground', 'border', 'data-1', 'data-2', 'data-3'],
  },
  {
    slug: 'label',
    name: 'Label',
    description: 'Accessible form label. Wraps Radix Label primitive with tokenised typography.',
    group: 'Forms',
    demos: [
      {
        name: 'LabelDefaultDemo',
        title: 'Default',
        code: `<Label htmlFor="email">Email</Label>
<Input id="email" type="email" />`,
      },
    ],
  },
  {
    slug: 'badge',
    name: 'Badge',
    description: 'Small status descriptor. Use for tags, counts, and inline status.',
    group: 'Feedback',
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
  {
    slug: 'separator',
    name: 'Separator',
    description: 'Visual or semantic divider between content sections.',
    group: 'Layout',
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
  {
    slug: 'avatar',
    name: 'Avatar',
    description: 'User avatar with image, fallback initials, and status badge.',
    group: 'Data',
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
  {
    slug: 'switch',
    name: 'Switch',
    description:
      'Two-state toggle. Use for on/off settings; prefer Checkbox for multi-select forms.',
    group: 'Forms',
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
  {
    slug: 'skeleton',
    name: 'Skeleton',
    description:
      'Loading placeholder with subtle shimmer. Match the rough size of incoming content.',
    group: 'Feedback',
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
  {
    slug: 'progress',
    name: 'Progress',
    description: 'Linear determinate progress bar. Pass `value` 0–100.',
    group: 'Feedback',
    demos: [
      {
        name: 'ProgressDefaultDemo',
        title: 'Default',
        code: '<Progress value={66} />',
      },
    ],
  },
  {
    slug: 'progress-display',
    name: 'ProgressDisplay',
    description: 'Composite progress affordance with label, percentage, and bar.',
    group: 'Feedback',
    demos: [
      {
        name: 'ProgressDisplayDefaultDemo',
        title: 'Default',
        code: '<ProgressDisplay label="Uploading" value={66} />',
      },
    ],
  },
  {
    slug: 'textarea',
    name: 'Textarea',
    description: 'Multi-line text input. Auto-resizes if you let it, or clamp via `rows`.',
    group: 'Forms',
    demos: [
      {
        name: 'TextareaDefaultDemo',
        title: 'Default',
        code: '<Textarea placeholder="Tell us more…" />',
      },
    ],
  },
  {
    slug: 'password-input',
    name: 'PasswordInput',
    description: 'Input variant for password entry with an eye toggle to reveal characters.',
    group: 'Forms',
    demos: [
      {
        name: 'PasswordInputDefaultDemo',
        title: 'Default',
        code: '<PasswordInput placeholder="Enter password" />',
      },
    ],
  },
  {
    slug: 'slider',
    name: 'Slider',
    description: 'Single-thumb range slider. Pass `value` (controlled) or `defaultValue`.',
    group: 'Forms',
    demos: [
      {
        name: 'SliderDefaultDemo',
        title: 'Default',
        code: '<Slider defaultValue={[50]} max={100} step={1} />',
      },
    ],
  },
  {
    slug: 'select',
    name: 'Select',
    description: 'Dropdown selection menu. Wraps Radix Select with tokenised styling.',
    group: 'Forms',
    demos: [
      {
        name: 'SelectDefaultDemo',
        title: 'Default',
        code: `<Select>
  <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="a">Option A</SelectItem>
    <SelectItem value="b">Option B</SelectItem>
  </SelectContent>
</Select>`,
      },
    ],
  },
  {
    slug: 'tabs',
    name: 'Tabs',
    description: 'Tabbed navigation between related views.',
    group: 'Navigation',
    demos: [
      {
        name: 'TabsDefaultDemo',
        title: 'Default',
        code: `<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="activity">Activity</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">…</TabsContent>
  <TabsContent value="activity">…</TabsContent>
</Tabs>`,
      },
    ],
  },
  {
    slug: 'breadcrumb',
    name: 'Breadcrumb',
    description: 'Hierarchical location indicator with separators.',
    group: 'Navigation',
    demos: [
      {
        name: 'BreadcrumbDefaultDemo',
        title: 'Default',
        code: `<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href="/">Home</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>Settings</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>`,
      },
    ],
  },
  {
    slug: 'dialog',
    name: 'Dialog',
    description: 'Modal dialog. Use for confirmations, forms, and focused tasks.',
    group: 'Overlays',
    demos: [
      {
        name: 'DialogDefaultDemo',
        title: 'Default',
        code: `<Dialog>
  <DialogTrigger asChild><Button>Open</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Are you sure?</DialogTitle>
      <DialogDescription>This cannot be undone.</DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>`,
      },
    ],
  },
  {
    slug: 'alert-dialog',
    name: 'AlertDialog',
    description: 'Confirmation dialog with destructive intent. Blocks interaction until resolved.',
    group: 'Overlays',
    demos: [
      {
        name: 'AlertDialogDefaultDemo',
        title: 'Default',
        code: `<AlertDialog>
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
</AlertDialog>`,
      },
    ],
  },
  {
    slug: 'sheet',
    name: 'Sheet',
    description: 'Side-anchored panel. Use for navigation, filters, or lightweight detail views.',
    group: 'Overlays',
    demos: [
      {
        name: 'SheetDefaultDemo',
        title: 'Default',
        code: `<Sheet>
  <SheetTrigger asChild><Button>Open</Button></SheetTrigger>
  <SheetContent>…</SheetContent>
</Sheet>`,
      },
    ],
  },
  {
    slug: 'popover',
    name: 'Popover',
    description: 'Floating panel anchored to a trigger. Use for menus, info panels, mini-forms.',
    group: 'Overlays',
    demos: [
      {
        name: 'PopoverDefaultDemo',
        title: 'Default',
        code: `<Popover>
  <PopoverTrigger asChild><Button>Open</Button></PopoverTrigger>
  <PopoverContent>Popover content</PopoverContent>
</Popover>`,
      },
    ],
  },
  {
    slug: 'tooltip',
    name: 'Tooltip',
    description: 'Hovered or focused text overlay. Wrap roots in `<TooltipProvider>`.',
    group: 'Overlays',
    demos: [
      {
        name: 'TooltipDefaultDemo',
        title: 'Default',
        code: `<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild><Button>Hover</Button></TooltipTrigger>
    <TooltipContent>Helpful hint</TooltipContent>
  </Tooltip>
</TooltipProvider>`,
      },
    ],
  },
  {
    slug: 'dropdown-menu',
    name: 'DropdownMenu',
    description: 'Floating menu attached to a button trigger.',
    group: 'Overlays',
    demos: [
      {
        name: 'DropdownMenuDefaultDemo',
        title: 'Default',
        code: `<DropdownMenu>
  <DropdownMenuTrigger asChild><Button>Open</Button></DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Profile</DropdownMenuItem>
    <DropdownMenuItem>Settings</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem>Log out</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`,
      },
    ],
  },
  {
    slug: 'collapsible',
    name: 'Collapsible',
    description: 'Two-state container that hides or reveals content. Use for FAQs, accordions.',
    group: 'Layout',
    demos: [
      {
        name: 'CollapsibleDefaultDemo',
        title: 'Default',
        code: `<Collapsible>
  <CollapsibleTrigger>Toggle</CollapsibleTrigger>
  <CollapsibleContent>Hidden content</CollapsibleContent>
</Collapsible>`,
      },
    ],
  },
  {
    slug: 'scroll-area',
    name: 'ScrollArea',
    description: 'Container with custom scrollbars. Use to constrain a tall list inside a card.',
    group: 'Layout',
    demos: [
      {
        name: 'ScrollAreaDefaultDemo',
        title: 'Default',
        code: '<ScrollArea className="h-48 w-64">…</ScrollArea>',
      },
    ],
  },
  {
    slug: 'table',
    name: 'Table',
    description:
      'Structured tabular data. Compose with TableHeader, TableBody, TableRow, TableCell.',
    group: 'Data',
    demos: [
      {
        name: 'TableDefaultDemo',
        title: 'Default',
        code: `<Table>
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
</Table>`,
      },
    ],
  },
  {
    slug: 'chart',
    name: 'Chart',
    description: 'Recharts wrapper that consumes the theme `--data-*` palette.',
    group: 'Data',
    demos: [
      {
        name: 'ChartDefaultDemo',
        title: 'Default',
        code: '<Chart data={…} />',
      },
    ],
  },
  {
    slug: 'code-block',
    name: 'CodeBlock',
    description: 'Syntax-highlighted code with copy button. Powered by Shiki.',
    group: 'Data',
    demos: [
      {
        name: 'CodeBlockDefaultDemo',
        title: 'Default',
        code: `<CodeBlock language="tsx" code="<Button>Hello</Button>">
  <CodeBlockHeader />
  <CodeBlockContent />
</CodeBlock>`,
      },
    ],
  },
  {
    slug: 'input-group',
    name: 'InputGroup',
    description: 'Compose an Input with adornments — addon icons, trailing buttons, prefix labels.',
    group: 'Forms',
    demos: [
      {
        name: 'InputGroupDefaultDemo',
        title: 'Default',
        code: `<InputGroup>
  <InputGroupAddon>$</InputGroupAddon>
  <InputGroupInput placeholder="0.00" />
</InputGroup>`,
      },
    ],
  },
  {
    slug: 'button-group',
    name: 'ButtonGroup',
    description: 'Visually-joined cluster of buttons sharing borders.',
    group: 'Primitives',
    demos: [
      {
        name: 'ButtonGroupDefaultDemo',
        title: 'Default',
        code: `<ButtonGroup>
  <Button>Bold</Button>
  <Button>Italic</Button>
  <Button>Underline</Button>
</ButtonGroup>`,
      },
    ],
  },
  {
    slug: 'empty-state',
    name: 'EmptyState',
    description: 'Friendly placeholder for empty lists or zero-results states.',
    group: 'Feedback',
    demos: [
      {
        name: 'EmptyStateDefaultDemo',
        title: 'Default',
        code: `<EmptyState>
  <EmptyStateIcon><InboxIcon /></EmptyStateIcon>
  <EmptyStateTitle>No messages</EmptyStateTitle>
  <EmptyStateDescription>You're all caught up.</EmptyStateDescription>
</EmptyState>`,
      },
    ],
  },
  {
    slug: 'page-header',
    name: 'PageHeader',
    description: 'Standard page title block with optional description, count, and action slots.',
    group: 'Layout',
    demos: [
      {
        name: 'PageHeaderDefaultDemo',
        title: 'Default',
        code: `<PageHeader>
  <PageHeaderInfo>
    <PageHeaderTitle>Dashboards</PageHeaderTitle>
    <PageHeaderDescription>All your monitoring views in one place.</PageHeaderDescription>
  </PageHeaderInfo>
  <PageHeaderActions>
    <Button>New dashboard</Button>
  </PageHeaderActions>
</PageHeader>`,
      },
    ],
  },
  {
    slug: 'section',
    name: 'Section',
    description: 'Standard section block — heading, description, and content area.',
    group: 'Layout',
    demos: [
      {
        name: 'SectionDefaultDemo',
        title: 'Default',
        code: `<Section>
  <SectionHeader>
    <SectionTitle>Connected services</SectionTitle>
    <SectionDescription>Manage integrations and API keys.</SectionDescription>
  </SectionHeader>
  <SectionContent>…</SectionContent>
</Section>`,
      },
    ],
  },
  {
    slug: 'section-label',
    name: 'SectionLabel',
    description: 'Small uppercase label that introduces a content block.',
    group: 'Layout',
    demos: [
      {
        name: 'SectionLabelDefaultDemo',
        title: 'Default',
        code: '<SectionLabel>Recent activity</SectionLabel>',
      },
    ],
  },
  {
    slug: 'sidebar',
    name: 'Sidebar',
    description: 'App shell sidebar with collapse-to-rail behaviour. Composable navigation.',
    group: 'Navigation',
    demos: [
      {
        name: 'SidebarDefaultDemo',
        title: 'Default',
        code: `<SidebarProvider>
  <Sidebar>...</Sidebar>
  <SidebarTrigger />
</SidebarProvider>`,
      },
    ],
  },
  {
    slug: 'overflow-list',
    name: 'OverflowList',
    description:
      'List that adapts to available width by collapsing overflow into a "+N more" indicator.',
    group: 'Data',
    demos: [
      {
        name: 'OverflowListDefaultDemo',
        title: 'Default',
        code: `<OverflowList>
  <OverflowListContent>...</OverflowListContent>
  <OverflowListIndicator />
</OverflowList>`,
      },
    ],
  },
  {
    slug: 'brika-logo',
    name: 'BrikaLogo',
    description: 'Brika brand mark — three stacked bricks. Uses currentColor.',
    group: 'Primitives',
    demos: [
      {
        name: 'BrikaLogoDefaultDemo',
        title: 'Default',
        code: '<BrikaLogo />',
      },
    ],
  },
] as const;

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
