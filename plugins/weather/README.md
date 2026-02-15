# Weather Plugin

Beautiful weather display plugin for Brika with current conditions, multi-day forecasts, and compact temperature widgets. Uses the free [Open-Meteo API](https://open-meteo.com/) — no API key required.

## Bricks

### Current Weather

Live weather conditions with dynamic gradient backgrounds that change based on weather.

- **Sizes:** 1×1 to 12×8
- **Displays:** Temperature, feels-like, humidity, wind speed/direction, pressure
- **Layouts:** Compact (1-2 cols), medium (3-4 cols), large (5+ cols) — content adapts to available space

### Weather Forecast

Multi-day weather forecast with daily highs, lows, and condition icons.

- **Sizes:** 2×1 to 12×6
- **Displays:** Up to 7 days of forecast data
- **Layouts:** Vertical list (narrow) or horizontal grid (wide) — adapts to brick dimensions
- **Config:** Number of forecast days (1-7)

### Temperature (Compact)

Minimal temperature and condition display for small spaces.

- **Sizes:** 1×1 to 3×3
- **Displays:** Current temperature, weather icon, condition label

## Configuration

### Plugin Preferences

| Preference | Type | Default | Description |
|---|---|---|---|
| City | text | _(auto-detect)_ | City name for weather data |
| Temperature Unit | dropdown | Celsius | Celsius or Fahrenheit |

Each brick can also override the city and unit via its own config.

**City resolution order:** brick config → plugin preference → device location → Zurich (fallback)

## Data Source

Weather data is fetched from [Open-Meteo](https://open-meteo.com/) and polled every 10 minutes. Polling is reference-counted — multiple bricks showing the same city share a single polling timer.

Supports 50 WMO weather codes mapped to 9 condition types (clear, partly cloudy, cloudy, fog, drizzle, rain, snow, showers, thunderstorm), each with its own icon, gradient background, and accent color.

## Localization

Fully translated in English and French, covering weather conditions, stats labels, day names, and all UI strings.

## Development

```bash
# Type-check
bun run tsc

# Run tests
bun test
```
