import { type I18nRef, Avatar, Box, Column, Divider, Grid, Icon, Row, Spacer, Text, defineBrick, useBrickSize, useLocale, usePreference } from '@brika/sdk/bricks';
import { useWeather } from '../use-weather';
import { dayName, formatTempWithUnit, getWeatherVisuals } from '../utils';
import { CITY_UNIT_CONFIG, WeatherError, WeatherLoading } from './shared';

// ─── Day props shared by both layouts ───────────────────────────────────────

interface DayProps {
  dayLabel: I18nRef;
  code: number;
  high: number;
  low: number;
  unit: string;
}

// ─── List row (narrow) — single-line per day, maximally scannable ───────────

function DayRow({ dayLabel, code, high, low, unit }: Readonly<DayProps>) {
  const { meta, color } = getWeatherVisuals(code);

  return (
    <Row gap="sm" align="center">
      <Avatar icon={meta.icon} color={color} size="sm" />
      <Column grow>
        <Text content={dayLabel} variant="body" weight="medium" color="#ffffff" maxLines={1} />
      </Column>
      <Text content={formatTempWithUnit(high, unit)} variant="body" weight="bold" color="#ffffff" />
      <Text content={formatTempWithUnit(low, unit)} variant="body" color="rgba(255,255,255,0.35)" />
    </Row>
  );
}

// ─── Grid cell (wide) — compact vertical card ──────────────────────────────

function DayCell({ dayLabel, code, high, low, unit }: Readonly<DayProps>) {
  const { meta, color } = getWeatherVisuals(code);

  return (
    <Column gap="sm" align="center">
      <Text content={dayLabel} variant="caption" weight="semibold" color="rgba(255,255,255,0.7)" maxLines={1} />
      <Avatar icon={meta.icon} color={color} size="sm" />
      <Row gap="sm" align="end">
        <Text content={formatTempWithUnit(high, unit)} variant="body" weight="bold" color="#ffffff" />
        <Text content={formatTempWithUnit(low, unit)} variant="caption" color="rgba(255,255,255,0.35)" />
      </Row>
    </Column>
  );
}

// ─── Brick Definition ────────────────────────────────────────────────────────

export const forecastBrick = defineBrick(
  {
    id: 'forecast',
    families: ['md', 'lg'],
    minSize: { w: 2, h: 1 },
    maxSize: { w: 12, h: 6 },
    config: [
      ...CITY_UNIT_CONFIG,
      { type: 'number', name: 'days', default: 7, min: 1, max: 7, step: 1 },
    ],
  },
  () => {
    const { t } = useLocale();
    const { weather, unit } = useWeather();
    const [days] = usePreference<number>('days', 7);
    const { width, height } = useBrickSize();

    if (weather.loading && weather.daily.length === 0) return <WeatherLoading variant="forecast" />;
    if (weather.error && weather.daily.length === 0) return <WeatherError message={weather.error} />;
    if (weather.daily.length === 0) return <WeatherLoading variant="forecast" />;

    const code = weather.current?.weatherCode ?? 3;
    const { gradient } = getWeatherVisuals(code);
    const locationName = weather.location?.name ?? '';

    const useGrid = width >= 4;

    // Grid: one row only — cap days by width. List: cap by height.
    let maxVisible = width;
    if (!useGrid) {
      if (height >= 3) maxVisible = 7;
      else if (height >= 2) maxVisible = 5;
      else maxVisible = 3;
    }
    const visibleDays = weather.daily.slice(0, Math.min(days, maxVisible));

    return (
      <Box background={gradient} rounded="sm" padding="lg" grow>
        <Column gap="sm" grow>
          {/* Header — location left, day count right */}
          <Row gap="sm" align="center">
            <Icon name="map-pin" size="sm" color="rgba(255,255,255,0.5)" />
            <Text content={locationName} variant="body" weight="semibold" color="#ffffff" maxLines={1} />
            <Spacer />
            <Text
              content={t('ui.dayForecast', { count: visibleDays.length })}
              variant="caption"
              color="rgba(255,255,255,0.45)"
            />
          </Row>
          <Divider color="rgba(255,255,255,0.1)" />

          {/* Forecast — grid when wide, list when narrow */}
          {useGrid
            ? (
              <Grid columns={visibleDays.length} gap="md">
                <>
                  {visibleDays.map((day) => (
                    <DayCell
                      key={day.date}
                      dayLabel={dayName(day.date, t)}
                      code={day.weatherCode}
                      high={day.tempMax}
                      low={day.tempMin}
                      unit={unit}
                    />
                  ))}
                </>
              </Grid>
            )
            : (
              <Column gap="sm" grow justify="between">
                <>
                  {visibleDays.map((day) => (
                    <DayRow
                      key={day.date}
                      dayLabel={dayName(day.date, t)}
                      code={day.weatherCode}
                      high={day.tempMax}
                      low={day.tempMin}
                      unit={unit}
                    />
                  ))}
                </>
              </Column>
            )}
        </Column>
      </Box>
    );
  },
);
