import { Chart, Grid, Image, Section, Slider, Stat, Status, Text } from '@brika/sdk/bricks/components';
import { defineBrick, useBrickSize, useEffect, usePreference, useState } from '@brika/sdk/bricks/core';

const WEATHER_CONDITIONS = ['sunny', 'cloudy', 'rainy', 'stormy', 'snowy'] as const;
const WEATHER_ICONS: Record<string, string> = {
  sunny: 'sun', cloudy: 'cloud', rainy: 'cloud-rain', stormy: 'cloud-lightning', snowy: 'snowflake',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTemp(value: number, unit: string): string {
  if (unit === 'fahrenheit') return `${Math.round(value * 9 / 5 + 32)}°F`;
  return `${value}°C`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function WeatherStatsNarrow({ temp, condition, humidity, unit, height, onSetTemp }: Readonly<{
  temp: number; condition: string; humidity: number; unit: string; height: number;
  onSetTemp: (payload?: Record<string, unknown>) => void;
}>) {
  return (
    <>
      <Stat label={condition} value={formatTemp(temp, unit)} icon={WEATHER_ICONS[condition] ?? 'thermometer'} color="#f59e0b" />
      {height >= 2 && <Status label="Condition" status={condition === 'stormy' ? 'warning' : 'online'} icon={WEATHER_ICONS[condition] ?? 'cloud'} />}
      {height >= 3 && <Stat label="Humidity" value={`${humidity}%`} icon="droplets" color="#3b82f6" />}
      {height >= 4 && <Slider label="Set temp" value={temp} min={-10} max={40} unit="°C" onChange={onSetTemp} color="#f59e0b" />}
    </>
  );
}

function WeatherStatsMedium({ temp, condition, humidity, unit, height, history, onSetTemp }: Readonly<{
  temp: number; condition: string; humidity: number; unit: string; height: number;
  history: Array<{ ts: number; value: number }>;
  onSetTemp: (payload?: Record<string, unknown>) => void;
}>) {
  return (
    <>
      <Grid columns={2} gap="sm">
        <Stat label="Temp" value={formatTemp(temp, unit)} icon="thermometer" color="#f59e0b" />
        <Stat label="Humidity" value={`${humidity}%`} icon="droplets" color="#3b82f6" />
      </Grid>
      <Status label="Condition" status={condition === 'stormy' ? 'warning' : 'online'} icon={WEATHER_ICONS[condition] ?? 'cloud'} />
      {height >= 3 && <Slider label="Set temp" value={temp} min={-10} max={40} unit="°C" onChange={onSetTemp} color="#f59e0b" />}
      {height >= 5 && history.length > 1 && (
        <Chart variant="line" data={history} color="#f59e0b" label="°C" />
      )}
    </>
  );
}

function WeatherStatsWide({ temp, condition, humidity, unit, width, height, history, onSetTemp }: Readonly<{
  temp: number; condition: string; humidity: number; unit: string; width: number; height: number;
  history: Array<{ ts: number; value: number }>;
  onSetTemp: (payload?: Record<string, unknown>) => void;
}>) {
  return (
    <>
      {height >= 3 && <Image src={`https://picsum.photos/seed/weather-${condition}/800/300`} rounded aspectRatio="2.5/1" fit="cover" />}
      <Section title="Current">
        <Grid columns={width >= 6 ? 3 : 2} gap="sm">
          <Stat label="Temp" value={formatTemp(temp, unit)} icon="thermometer" color="#f59e0b" />
          <Stat label="Humidity" value={`${humidity}%`} icon="droplets" color="#3b82f6" />
          {width >= 6 && <Stat label="Wind" value={`${Math.floor(Math.random() * 30)} km/h`} icon="wind" />}
        </Grid>
      </Section>
      {height >= 4 && <Slider label="Set temp" value={temp} min={-10} max={40} unit="°C" onChange={onSetTemp} color="#f59e0b" />}
      {height >= 5 && history.length > 1 && (
        <Section title="Temperature">
          <Chart variant="line" data={history} color="#f59e0b" label="°C" />
        </Section>
      )}
      <Text variant="caption" content={`Last updated: ${new Date().toLocaleTimeString()}`} />
    </>
  );
}

// ─── Brick ───────────────────────────────────────────────────────────────────

export const weatherBrick = defineBrick(
  {
    id: 'weather',
    name: 'Weather',
    description: 'Simulated weather display',
    icon: 'cloud-sun',
    color: '#f59e0b',
    families: ['sm', 'md', 'lg'],
    category: 'info',
    minSize: { w: 1, h: 1 },
    maxSize: { w: 12, h: 8 },
    config: [
      { type: 'dropdown', name: 'unit', label: 'Temperature Unit', options: [{ value: 'celsius' }, { value: 'fahrenheit' }], default: 'celsius' },
      { type: 'number', name: 'refreshInterval', label: 'Refresh Interval (ms)', description: 'How often to update weather data', default: 5000, min: 1000, max: 60000, step: 1000 },
    ],
  },
  () => {
    const { width, height } = useBrickSize();
    const [unit] = usePreference<string>('unit', 'celsius');
    const [refreshInterval] = usePreference<number>('refreshInterval', 5000);

    const [temp, setTemp] = useState(22);
    const [condition, setCondition] = useState<string>('sunny');
    const [humidity, setHumidity] = useState(45);
    const [history, setHistory] = useState<Array<{ ts: number; value: number }>>([]);

    const handleSetTemp = (payload?: Record<string, unknown>) => {
      if (typeof payload?.value === 'number') setTemp(payload.value);
    };

    useEffect(() => {
      const id = setInterval(() => {
        const newTemp = 18 + Math.floor(Math.random() * 12);
        const newCondition = WEATHER_CONDITIONS[Math.floor(Math.random() * WEATHER_CONDITIONS.length)];
        const newHumidity = 30 + Math.floor(Math.random() * 50);
        setTemp(newTemp);
        setCondition(newCondition);
        setHumidity(newHumidity);
        setHistory((prev: Array<{ ts: number; value: number }>) => [...prev.slice(-19), { ts: Date.now(), value: newTemp }]);
      }, refreshInterval);
      return () => clearInterval(id);
    }, []);

    if (width <= 2) {
      return <WeatherStatsNarrow temp={temp} condition={condition} humidity={humidity} unit={unit} height={height} onSetTemp={handleSetTemp} />;
    }

    if (width <= 4) {
      return <WeatherStatsMedium temp={temp} condition={condition} humidity={humidity} unit={unit} height={height} history={history} onSetTemp={handleSetTemp} />;
    }

    return <WeatherStatsWide temp={temp} condition={condition} humidity={humidity} unit={unit} width={width} height={height} history={history} onSetTemp={handleSetTemp} />;
  },
);
