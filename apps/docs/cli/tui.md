# TUI Dashboard

Running `brika` (or `brika dashboard`) opens an interactive terminal UI built with [Ink](https://github.com/vadimdemedes/ink) — full-screen, mouse-aware where the terminal supports it, navigable entirely from the keyboard.

The TUI is the canonical surface for managing a hub when you don't want to drive a browser. It mirrors what the web UI exposes, with one extra trick: the TUI can boot a hub for you (Ctrl+S) and tear it down (Ctrl+Q).

## Sidebar

Every screen is reachable from the sidebar on the left. Use the arrow keys (or `j`/`k`) to move between sections.

| Section | What it does |
|---|---|
| **Dashboard** | Hub health, recent activity, quick actions |
| **Plugins** | Tabbed: *Installed* and *Registry* |
| **Workflows** | List and (basic) edit of workflows |
| **Logs** | Live log stream — filter by level, source, plugin |
| **Users** | Create / edit / delete users, assign scopes |
| **Updates** | Check for and apply updates |
| **Settings** | Location, timezone, themes, remote access |
| **Help** | Keybindings, troubleshooting |

## Boot splash

When the TUI launches it plays a short boot animation (the "Brix" mascot). Skip it with `--no-boot` or `BRIKA_NO_BOOT=1`:

```sh
brika --no-boot
```

## Top-level keybindings

| Key | Action |
|---|---|
| `Ctrl+S` | Start the hub (same as `brika start`) |
| `Ctrl+Q` | Stop the hub (same as `brika stop`) |
| `?` | Open the help screen |
| `Esc` | Go back / close modal |
| `Ctrl+C` | Quit the TUI |

## Plugins

The most-used screen.

### Installed tab

Lists every plugin in `.brika/plugins/`. For each plugin:

* Health badge: `running`, `stopped`, `crashed`, `crash-loop`, `awaiting-config`, `degraded`.
* Version and source (npm or local workspace).
* Quick actions: enable/disable, reload, view logs, edit preferences, view permissions.

Selecting a plugin opens the detail view: README, configured preferences, granted permissions, declared blocks/bricks/pages/sparks/actions.

### Registry tab

Browse and install plugins from the curated index. Search by name or keyword, view the plugin's README and capabilities, install with one keystroke.

Under the hood the TUI calls the hub's [Registry API](../api/rest-reference.md) which proxies the curated index hosted on a Cloudflare Worker.

## Workflows

List the workflows defined on this hub, enable/disable them, see live event counts. The TUI does not include the full visual editor — that lives in the web UI — but it does let you see what's running.

## Logs

Live tail. Stream comes from `/api/stream/logs`. Filters:

* **Level** — `debug`, `info`, `warn`, `error`.
* **Source** — `hub`, `plugin`, `system`.
* **Plugin** — narrow to a single plugin UID.
* **Search** — free-text search.

The logs ring buffer keeps recent lines in memory for instant scroll-back without re-querying SQLite. See [Logs](../architecture/logs.md).

## Users

CRUD for hub users. Each user has a username, password, and a set of *scopes*. The `ADMIN_ALL` scope is the only one that can manage other users. See [Authentication](../architecture/auth.md) for the scope model.

## Updates

Check for a new release on the active channel (`stable` or `canary`), see the release notes, and apply. Same path as `brika update`, same UI as the web UI's *Settings → System → Updates* panel.

## Settings

* **Location** — lat/long, formatted address.
* **Timezone** — used by cron schedules and date formatting.
* **Theme** — pick from bundled themes or import a custom theme JSON.
* **Custom themes** — manage themes you've imported.
* **Remote access** — claim a name on the coordinator, copy your public URL.
* **Update channel** — stable / canary.

## Help

Lists every keybinding, contains a short troubleshooting guide, and links to these docs.

## See also

* **[Commands](commands.md)** — CLI subcommands.
* **[HTTP API](../api/overview.md)** — what the TUI talks to under the hood.
