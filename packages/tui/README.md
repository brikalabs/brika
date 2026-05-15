# @brika/tui

Generic [Ink](https://github.com/vadimdemedes/ink)-powered TUI primitives, hooks, and a dev launcher with React Fast Refresh. No branding, no app-specific glue — see [`@brika/brix`](../brix) for Brika's mascot layer and `apps/cli` for the brika CLI.

```bash
bun add @brika/tui ink react
```

`ink` and `react` are peer dependencies (`ink ^6`, `react ^18 || ^19`).

---

## Subsystem overview

The package is organised by concern. Every subsystem has its own subpath export so consumers only pull in what they use.

| Subpath              | What it ships                                                                 |
| -------------------- | ----------------------------------------------------------------------------- |
| `@brika/tui`         | Re-exports everything below.                                                  |
| `…/components`       | UI primitives — `Button`, `Input`, `List`, `Tabs`, `Search`, etc.             |
| `…/forms`            | Composable form primitives (`Form`, `FormField`, `FormInput`, validators).    |
| `…/keys`             | `useKey`, `<KeyScope>`, key-spec parser.                                      |
| `…/mouse`            | `useMouse`, `useClickable`, `useBounds` — mouse / click / hit-test plumbing.  |
| `…/router`           | Tiny typed router (`createRouter`, `<Outlet>`, `useRouter`).                  |
| `…/shell`            | `TuiShellProvider` — chrome height, app-level `onQuit`.                       |
| `…/state`            | Responsive breakpoints, scroll, search, terminal size, toast, fullscreen.    |
| `…/utils`            | ANSI helpers, clipboard, save-to-file, browser open, status glyphs.          |
| `…/debug`            | Console-capture + REPL overlay (`<DebugProvider>`, `Ctrl+D` to toggle).      |

The top-level export `import { … } from '@brika/tui'` re-exports every subpath, so for prototyping you can pull from one place and tighten imports later.

---

## Components

Located under `src/components/`. Each is a small React component built on Ink boxes. Props are always `Readonly<>`.

```tsx
import { Button, Card, HintBar, Hint, Input, List, ListItem, Pane, Tabs } from '@brika/tui';

<Pane title="Plugins">
  <Card>
    <List>
      <ListItem value="brika-mortar">brika-mortar</ListItem>
      <ListItem value="brika-mailer">brika-mailer</ListItem>
    </List>
  </Card>
  <HintBar>
    <Hint k="↑↓">select</Hint>
    <Hint k="enter">open</Hint>
    <Hint k="X" accent="destructive">remove</Hint>
  </HintBar>
</Pane>
```

Highlights:

- **`AppShell`** — top-level layout (header / body / footer slots).
- **`Button`** — keyboard- and mouse-activatable. `variant` covers `default | primary | destructive | ghost`.
- **`Input`** — single-line text input. Supports `password`, custom prefix, blinking cursor, focus events, mouse click-to-focus.
- **`List` / `ListItem`** — vertical menu with arrow-key navigation and mouse hit-testing.
- **`MenuBar`** — responsive top-nav strip. Collapses to chip-only on narrow widths.
- **`Pane`** — bordered region with optional title, footer, actions slot.
- **`Search`** — composable `<Search><SearchInput/><SearchResults>…</SearchResults></Search>` picker. `Enter` selects, `Ctrl+Enter` actions.
- **`Tabs`** — keyboard / mouse-driven tab strip.
- **`Heading` / `Badge` / `Spinner` / `Kbd` / `EmptyState` / `Properties`** — small leaf primitives.
- **`TerminalTooSmall`** — guard that swaps a "resize me" message in when the terminal is below a minimum size.

---

## Forms

`@brika/tui/forms` — shadcn-flavoured form primitives. The `<Form>` owns values, touched state, server errors, and lifecycle; fields auto-register from their children.

```tsx
import {
  Form,
  FormField,
  FormInput,
  FormPassword,
  FormSelect,
  FormSubmitError,
  compose,
  email,
  minLength,
  required,
} from '@brika/tui/forms';

<Form
  title="Add user"
  onSubmit={async (values) => {
    const res = await api.createUser(values);
    if (!res.ok) {
      throw new FormSubmitError('email already in use', { fields: { email: 'taken' } });
    }
  }}
  onCancel={close}
>
  <FormField name="email" label="Email" validate={compose(required(), email())}>
    <FormInput placeholder="ada@example.com" />
  </FormField>
  <FormField name="role" label="Role" initialValue="user">
    <FormSelect options={[{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }]} />
  </FormField>
  <FormField name="password" label="Password" validate={minLength(8)}>
    <FormPassword />
  </FormField>
</Form>;
```

- All fields render simultaneously; only the focused field expands its editor. `Tab` / `Shift+Tab` cycle.
- Live validation surfaces three statuses (`empty` / `valid` / `error`) as inline icons.
- Throw `FormSubmitError` from `onSubmit` to surface server-side field errors back into the form.
- Build custom field editors with `useFormField()` / `useFormControl()` and you stay inside the same validation lifecycle.
- Validators bundled: `required`, `minLength`, `maxLength`, `email`, `compose`, `check` (lift any `(value) => string | null` into a validator).

---

## Keys

```tsx
import { useKey, KeyScope } from '@brika/tui/keys';

useKey('ctrl+s', save);
useKey(['shift+up', 'shift+down'], (e) => move(e));
useKey('escape', cancel, isOpen); // 3rd arg gates the listener
```

Key specs are simple strings: `'a'`, `'ctrl+s'`, `'shift+tab'`, `'meta+enter'`, special names like `'escape'`, `'upArrow'`, `'pageUp'`, `'space'`.

`<KeyScope>` opens a sub-scope so child `useKey` registrations still fire while a focused `<Input>` captures raw text — useful inside pickers and modal forms.

---

## Mouse

Three layered hooks under `@brika/tui/mouse`. Most components only need the top one.

```tsx
import { useClickable } from '@brika/tui/mouse';
import { useRef } from 'react';
import { Box, type DOMElement } from 'ink';

function Tile({ onPress }: { onPress: () => void }) {
  const ref = useRef<DOMElement>(null);
  useClickable(ref, onPress);
  return <Box ref={ref}>…</Box>;
}
```

- **`useClickable(ref, onPress, enabled?)`** — fires `onPress` on a left-click anywhere inside the ref. Handles SGR sequence parsing, hit-tests against the ref's live bounds, and coalesces nested clickables (innermost element wins). The handler receives a `ClickInfo` with absolute + relative cell coordinates and the element's bounds at click time.
- **`useBounds(ref)`** / **`readBounds(el)`** / **`hitTest(bounds, event)`** — direct access for components that need bounds for reasons other than clicking (drag, drop zones, ripple positioning).
- **`useMouse(handler)`** — raw mouse-event subscriber. Enables SGR mouse reporting on stdin and emits parsed `MouseEvent`s (`{action, button, column, row, modifiers}`). Use this when you need wheel / drag / move events.

---

## Router

Tiny typed router. One instance per app.

```tsx
import { createRouter, defineRoute, Outlet, RouterProvider, useRouter } from '@brika/tui/router';

const routes = {
  main: defineRoute({ component: MainView }),
  help: defineRoute({ component: HelpView }),
  detail: defineRoute<{ id: string }>({ component: DetailView }),
} as const;

const router = createRouter({ routes, initial: { name: 'main' } });

function App() {
  return (
    <RouterProvider router={router}>
      <Outlet />
    </RouterProvider>
  );
}

// inside a child:
const r = useRouter<typeof routes>();
r.navigate('detail', { id: 'abc' });
if (r.current.name === 'detail') {
  // typed: r.current.params.id is string
}
```

`defineRoute<TParams>(...)` carries the params type through `navigate`, `useRouter().current`, and `<Outlet />` — no `any` fallbacks.

---

## Shell

`<TuiShellProvider>` wraps the app once and exposes layout-level state every view needs.

```tsx
import { TuiShellProvider, useTuiShell, useCaptureInput } from '@brika/tui/shell';

<TuiShellProvider chromeHeight={3} onQuit={() => process.exit(0)}>
  <App />
</TuiShellProvider>;

const { chromeHeight, requestQuit } = useTuiShell();
useCaptureInput(true); // route raw stdin to this scope (e.g. an Input that needs everything)
```

---

## State hooks

```tsx
import {
  useBreakpoint,
  useResponsiveValue,
  useTerminalSize,
  useScroll,
  useSearch,
  useToast,
  useFullscreen,
  useMeasure,
  useLayoutDimensions,
} from '@brika/tui/state';
```

- **`useTerminalSize()`** — `{columns, rows}`, updated on resize.
- **`useBreakpoint()`** / **`useResponsiveValue(value)`** — Tailwind-style responsive layouts for terminals (`base/sm/md/lg/xl` at `0/60/80/120/160` columns). Accepts plain values or `{base, md, lg}` maps.
- **`useScroll({totalLines, viewportLines})`** — manages a scrollable region: `Page Up/Down`, `Home/End`, follow-tail mode.
- **`useSearch()`** — `/`-style search mode toggle + query buffer for any view.
- **`useToast()`** — transient status messages with auto-dismiss.
- **`useFullscreen()`** — toggle alt-screen + fullscreen layout.
- **`useMeasure(ref)`** / **`useLayoutDimensions()`** — measure boxes and read the available content area inside chrome.

---

## Utils

```tsx
import {
  stripAnsiForFile,
  openInBrowser,
  copyLogsToClipboard,
  saveLogsToFile,
  statusGlyph,
  statusColor,
  statusLabel,
} from '@brika/tui/utils';
```

Pragmatic helpers: ANSI stripping for file writes, opening URLs in the user's browser, putting logs on the clipboard, and a small status vocabulary (`success | warning | error | info | pending`) with consistent glyphs.

---

## Debug overlay

Drop `<DebugProvider>` near the root and press the toggle key (defaults to `Ctrl+D`) to open a console + REPL window layered on top of the app.

```tsx
import { DebugProvider } from '@brika/tui/debug';

<DebugProvider enabled={process.env.NODE_ENV !== 'production'}>
  <App />
</DebugProvider>;
```

- Captures `console.log/info/warn/error` and uncaught errors into a ring buffer (default 500 entries).
- Press `Ctrl+D` (or your `toggleKey`) to open. The overlay shows recent entries and a single-line REPL — anything you type runs as the body of an async function, so `await` works.
- Singleton-guarded so StrictMode / HMR remounts don't double-wrap.

---

## `tui` dev launcher

The package ships a `tui` bin that runs an Ink app with React Fast Refresh and an error overlay:

```bash
bunx tui src/main.tsx
```

What it does:

- Watches the entry and its imports.
- Hot-replaces React components in place (state is preserved where Fast Refresh allows).
- Surfaces compile and runtime errors in a TUI overlay (`HmrErrorOverlay`) instead of crashing the process.

Use it for component / view development inside `apps/cli` or any consumer app. Production runs do not need it.

---

## Development

```bash
bun --filter @brika/tui test         # unit tests
bun --filter @brika/tui typecheck    # tsgo --noEmit
```

Tests live next to their sources as `*.test.ts` (currently exercising `keys`, `router`, `utils`, mouse SGR parsing). Pure helpers should be testable without rendering; lean on Bun's built-in `test` runner.

---

## Conventions

- Component props are always wrapped in `Readonly<>` (SonarQube S6759).
- No `as` type casts and no `any` — use type guards, narrowing, or `unknown` + runtime checks.
- Default to no comments. When a comment is justified, explain **why** the code looks the way it does, not what it's doing.
- Mouse-aware components should consume `useClickable` rather than re-implementing hit-testing. The "innermost wins" coalescer relies on every clickable subscriber going through that hook.
