# @brika/plugin-demo-config

Demo plugin that exercises every preference type the Brika preferences system supports. Useful as:

- A reference when wiring preferences in your own plugin
- A smoke-test target for the hub's preference UI
- A quick visual check that the consent flow still renders all variants correctly

## What it shows

- `string`, `number`, `boolean`, `enum`, `multi-select`
- `secret` (stored in the OS keychain via `Bun.secrets`)
- Conditional preferences (`showWhen`)
- Validation rules + custom error messages
- Default values + reset behavior

Open the plugin's settings page in the hub UI to see each control rendered.

## Running

The plugin auto-loads when the hub is built with the bundled plugin set. There is nothing to configure — the values are read-only inside the plugin and only exist to make the UI light up.
