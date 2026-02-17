import { type I18nRef, Avatar, Box, Column, Divider, Grid, Icon, Row, Spacer, Text, defineBrick, useLocale } from '@brika/sdk/bricks';
import { useWeather } from '../use-weather';
import {
  formatTemp,
  formatTempWithUnit,
  getWeatherVisuals,
  tempUnit,
  windDirectionLabel,
} from '../utils';
import { CITY_UNIT_CONFIG, WeatherError, WeatherLoading } from './shared';

// ─── Inline stat (icon + label + value + suffix) ────────────────────────────

function WeatherStat({
  icon,
  label,
  value,
  suffix,
}: Readonly<{
  icon: string;
  label: string | I18nRef;
  value: string;
  suffix?: string;
}>) {
  return (
    <Column gap="sm" grow>
      <Row gap="sm" align="center">
        <Icon name={icon} size="sm" color="rgba(255,255,255,0.5)" />
        <Text content={label} variant="caption" size="xs" color="rgba(255,255,255,0.6)" maxLines={1} />
      </Row>
      <Row gap="sm" align="end">
        <Text content={value} variant="heading" weight="bold" color="#ffffff" maxLines={1} />
        {suffix ? (
          <Text content={suffix} variant="caption" size="xs" color="rgba(255,255,255,0.5)" maxLines={1} />
        ) : null}
      </Row>
    </Column>
  );
}

// ─── Brick Definition ──────────────────────────────────────────────────────

export const currentBrick = defineBrick(
  {
    id: 'current',
    families: ['sm', 'md', 'lg'],
    minSize: { w: 1, h: 1 },
    maxSize: { w: 12, h: 8 },
    config: CITY_UNIT_CONFIG,
  },
  () => {
    const { t } = useLocale();
    const { weather, unit } = useWeather();

    if (weather.loading && !weather.current) return <WeatherLoading />;
    if (weather.error && !weather.current) return <WeatherError message={weather.error} />;
    if (!weather.current || !weather.location) return <WeatherLoading />;

    const { meta, color, gradient } = getWeatherVisuals(weather.current.weatherCode);

    return (
      <Box background={gradient} rounded="sm" padding="lg" grow>
        <Column gap="md" grow justify="between">
          {/* Header: location + condition label */}
          <Row gap="sm" align="center">
            <Icon name="map-pin" size="sm" color="rgba(255,255,255,0.5)" />
            <Text content={weather.location.name} variant="body" weight="bold" color="#ffffff" maxLines={1} />
            <Spacer />
            <Text content={t(meta.labelKey)} variant="caption" color="rgba(255,255,255,0.6)" maxLines={1} />
          </Row>

          {/* Main: avatar + temp + feels like */}
          <Row gap="md" align="center">
            <Avatar icon={meta.icon} color={color} size="lg" />
            <Column gap="sm" grow>
              <Text
                content={formatTempWithUnit(weather.current.temperature, unit)}
                variant="heading"
                size="xl"
                weight="bold"
                color="#ffffff"
                maxLines={1}
              />
              <Text
                content={t('stats.feelsLikeTemp', { temp: formatTempWithUnit(weather.current.apparentTemperature, unit) })}
                variant="caption"
                color="rgba(255,255,255,0.6)"
                maxLines={1}
              />
            </Column>
          </Row>

          {/* Stats: auto-fit grid wraps to available width */}
          <Divider color="rgba(255,255,255,0.12)" />
          <Grid autoFit minColumnWidth={90} gap="md">
            <WeatherStat
              icon="thermometer"
              label={t('stats.feelsLike')}
              value={formatTemp(weather.current.apparentTemperature, unit)}
              suffix={tempUnit(unit)}
            />
            <WeatherStat
              icon="droplets"
              label={t('stats.humidity')}
              value={`${weather.current.humidity}`}
              suffix="%"
            />
            <WeatherStat
              icon="wind"
              label={t('stats.wind')}
              value={`${Math.round(weather.current.windSpeed)}`}
              suffix={`km/h ${windDirectionLabel(weather.current.windDirection)}`}
            />
            <WeatherStat
              icon="gauge"
              label={t('stats.pressure')}
              value={`${Math.round(weather.current.pressure)}`}
              suffix="hPa"
            />
          </Grid>

          {/* Updated timestamp */}
          <Text
            content={t('ui.updated', { time: weather.lastUpdated !== null ? new Date(weather.lastUpdated).toLocaleTimeString() : '' })}
            variant="caption"
            color="rgba(255,255,255,0.35)"
            maxLines={1}
          />
        </Column>
      </Box>
    );
  },
);
