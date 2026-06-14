# @brika/plugin-sil-electricity

Brika plugin that pulls your electricity-consumption data from [Services Industriels de Lausanne](https://www.sil.ch/) (Lausanne, Switzerland) and exposes it as live Brick widgets and workflow inputs.

## Setup

1. Install the plugin in the hub UI.
2. Open the plugin's settings and add your SIL account credentials. The password is a `password` preference, so the hub stores it in the OS keychain rather than in plaintext config.
3. The plugin polls SIL's portal on a configurable interval (default: 6 hours) and caches readings locally.

## What it exposes

- A **Brick** showing today + this-month consumption with a small chart
- A workflow **Spark** that fires on each new reading
- A workflow **Block** returning the latest cumulative kWh
- Sensor-style ports typed as `power.kwh` from [`@brika/type-system`](../../packages/type-system/)

## Scope

- Read-only — there is no SIL API surface for control, only meter reads.
- Account credentials never leave the hub. The plugin talks to SIL directly; Brika cloud is not involved.
- Lausanne-specific. If your utility has a similar portal, this plugin is a good starting point for forking — most of the code is a typed HTTP client + a polling loop, not SIL-specific.
