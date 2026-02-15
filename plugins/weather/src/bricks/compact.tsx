import {
  Avatar,
  Box,
  Column,
  Icon,
  Row,
  Text,
} from '@brika/sdk/bricks/components';
import { defineBrick, useLocale } from '@brika/sdk/bricks/core';
import { useWeather } from '../use-weather';
import { formatTempWithUnit, getWeatherVisuals } from '../utils';
import { CITY_UNIT_CONFIG, WeatherError, WeatherLoading } from './shared';

// ─── Brick Definition ──────────────────────────────────────────────────────

export const compactBrick = defineBrick(
  {
    id: 'compact',
    families: ['sm'],
    minSize: { w: 1, h: 1 },
    maxSize: { w: 3, h: 3 },
    config: CITY_UNIT_CONFIG,
  },
  () => {
    const { t } = useLocale();
    const { weather, unit } = useWeather();

    if (weather.loading && !weather.current) return <WeatherLoading variant="compact" />;
    if (weather.error && !weather.current) return <WeatherError message={t('ui.noData')} />;
    if (!weather.current || !weather.location) return <WeatherLoading variant="compact" />;

    const { meta, color, gradient } = getWeatherVisuals(weather.current.weatherCode);
    const temp = formatTempWithUnit(weather.current.temperature, unit);

    return (
      <Box background={gradient} rounded="sm" padding="md" grow>
        <Column gap="sm" justify="center" grow>
          <Row gap="sm" align="center">
            <Avatar icon={meta.icon} color={color} size="md" />
            <Column gap="sm" grow>
              <Text content={temp} variant="heading" weight="bold" color="#ffffff" maxLines={1} />
              <Text content={t(meta.labelKey)} variant="caption" color="rgba(255,255,255,0.65)" maxLines={1} />
            </Column>
          </Row>
          <Row gap="sm" align="center">
            <Icon name="map-pin" size="sm" color="rgba(255,255,255,0.5)" />
            <Text
              content={weather.location.name}
              variant="caption"
              weight="semibold"
              color="rgba(255,255,255,0.85)"
              maxLines={1}
            />
          </Row>
          <Row gap="sm" align="center">
            <Icon name="thermometer" size="sm" color="rgba(255,255,255,0.5)" />
            <Text
              content={t('stats.feelsLikeTemp', { temp: formatTempWithUnit(weather.current.apparentTemperature, unit) })}
              variant="caption"
              color="rgba(255,255,255,0.6)"
              maxLines={1}
            />
          </Row>
        </Column>
      </Box>
    );
  },
);
