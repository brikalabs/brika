# Mockups

ASCII drafts of the Brika CLI's primary surfaces. These are the target
look — not pixel‑exact; widths assume an 80‑col terminal.

## 1. Startup header (compile‑time / `--version`)

```
(◕◡◕) Brika Runtime
```

## 2. Default `brika` (dashboard)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ (◕◡◕) Brika Runtime v0.1.0                                                  │
│                                                                              │
│ workspace: ~/projects/brika                                                  │
│ plugins: 12   workflows: 4   status: watching                                │
╰──────────────────────────────────────────────────────────────────────────────╯
╭ Hub ───────────────────╮ ╭ Plugins ─────────────────╮ ╭ Workflows ─────────╮
│ (^◡^) running          │ │ ▸ timer        v1.2.0    │ │ ▸ morning-light    │
│ pid  1234              │ │ ▸ webhook-in   v0.9.1    │ │   running          │
│ since 12:04            │ │ ▸ slack        v0.3.0    │ │ ▸ daily-digest     │
│ port  3001             │ │ ▸ http-out     v1.0.4    │ │   idle             │
│                        │ │ … +8 more                │ │ … +2 more          │
╰────────────────────────╯ ╰──────────────────────────╯ ╰────────────────────╯
╭ Recent logs ────────────────────────────────────────────────────────────────╮
│ 12:08:21  info   workflow timer        tick                                 │
│ 12:08:23  info   plugin    http-out    request 200 GET /healthz             │
│ 12:08:25  warn   plugin    slack       rate-limited (60s)                   │
│ 12:08:32  info   workflow morning-light starting                            │
╰─────────────────────────────────────────────────────────────────────────────╯
 (•◡•) watching
 [tab] focus  [l] logs  [p] plugins  [w] workflows  [?] help  [q] quit
 brika v0.1.0 · tiny blocks. big automation.
```

## 3. Log tail (`brika log -f`)

```
╭ Brika · log ─────────────────────────────────────────── live tail ──────────╮
│ 12:08:21  info   workflow timer        tick                                 │
│ 12:08:23  info   plugin    http-out    request 200 GET /healthz             │
│ 12:08:25  warn   plugin    slack       rate-limited (60s)                   │
│ 12:08:32  info   workflow morning-light starting                            │
│ 12:08:33  info   workflow morning-light block:lights → on                   │
│ 12:08:34  info   workflow morning-light block:notify → sent                 │
│ 12:08:34  info   workflow morning-light completed                           │
│                                                                              │
╰─────────────────────────────────────────────────────────────────────────────╯
 (•~•) tailing — / search  l level  s source  q quit
 brika v0.1.0
```

## 4. Plugin list

```
╭ Brika · plugins ─────────────────────────────────────────────────── 12 ─────╮
│ ▸ timer            v1.2.0     enabled    last tick   12:08:21               │
│   webhook-in       v0.9.1     enabled    -                                  │
│   slack            v0.3.0     enabled    last call   12:08:25  warn         │
│   http-out         v1.0.4     enabled    -                                  │
│   weather          v2.1.0     disabled   -                                  │
│   …                                                                          │
╰─────────────────────────────────────────────────────────────────────────────╯
 (◔◡◔) browsing plugins — enter open  d disable  e enable  l logs  q back
```

## 5. Workflow detail

```
╭ Brika · workflow · morning-light ───────────────────────────── running ─────╮
│                                                                              │
│   ╭─ trigger ─╮   ╭─ block ───╮   ╭─ block ───╮   ╭─ output ──╮             │
│   │ timer 07:30│ → │ lights:on  │ → │ notify ▲   │ → │ done       │           │
│   ╰────────────╯   ╰────────────╯   ╰────────────╯   ╰────────────╯           │
│                                                                              │
│ recent runs:                                                                 │
│   ✓ 2026-05-14 07:30  640ms                                                  │
│   ✓ 2026-05-13 07:30  720ms                                                  │
│   ✗ 2026-05-12 07:30  failed at notify (slack rate limit)                    │
│                                                                              │
╰─────────────────────────────────────────────────────────────────────────────╯
 (^◡^) running — r retry  l logs  q back
```

## 6. Error state

```
╭ Brika ──────────────────────────────────────────────────────────────────────╮
│                                                                              │
│ (×◠×) plugin slack crashed                                                  │
│                                                                              │
│ Error: connect ETIMEDOUT slack.com:443                                       │
│   at TcpConnect (node:net:1234)                                              │
│   …                                                                          │
│                                                                              │
│  ╭───────────────────────────────╮                                           │
│  │ that plugin exploded politely │                                           │
│  ╰───────────────────────────────╯                                           │
│                (◔◡◔)                                                         │
│                                                                              │
│ (◔◡◔) attempting recovery in 3s — Ctrl+C to abort                            │
╰─────────────────────────────────────────────────────────────────────────────╯
```

## 7. Hub stopped (entering dashboard with no hub)

```
                  (-◡-) zZ

           the hub is sleeping

   ╭────────────────────────────────────────╮
   │ press [s] to start it                  │
   │ press [q] to quit                      │
   ╰────────────────────────────────────────╯
```

## 8. One‑shot status

```
$ brika status
(^◡^) running  PID 1234
```

```
$ brika status
(-◡-) stopped
```

```
$ brika status
(¬◡¬) stale PID 1234 — cleared
```

## 9. One‑shot start

```
$ brika start
(•▁•) booting…
(◔◡◔) loading plugins…
(◕▿◕) building workflows…
(^◡^) runtime ready  →  http://localhost:3001
```

## 10. Help (`brika ?` inside the TUI)

```
╭ Brika · help ───────────────────────────────────────────────────────────────╮
│ Navigation                                                                   │
│   [tab]  next pane                  [shift+tab]  previous pane               │
│   [↑/↓]  move selection             [pgup/pgdn] page                         │
│                                                                              │
│ Views                                                                        │
│   [l] log tail   [p] plugins   [w] workflows   [d] dashboard                 │
│                                                                              │
│ Actions                                                                      │
│   [s] start hub   [x] stop hub   [r] restart hub                             │
│   [o] open URL    [c] copy URL                                               │
│                                                                              │
│ Misc                                                                         │
│   [/]  search     [?] this help    [q]/[Ctrl+C] quit                         │
╰─────────────────────────────────────────────────────────────────────────────╯
 brika v0.1.0 · tiny blocks. big automation.
```
