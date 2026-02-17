import { type BrickTypeSpec, type TextContent, Column, Icon, Skeleton, Text } from '@brika/sdk/bricks';

// ─── Shared brick config (city + unit dropdown) ─────────────────────────────

export const CITY_UNIT_CONFIG: NonNullable<BrickTypeSpec['config']> = [
  { type: 'text', name: 'city' },
  {
    type: 'dropdown',
    name: 'unit',
    options: [{ value: 'default' }, { value: 'celsius' }, { value: 'fahrenheit' }],
    default: 'default',
  },
];

// ─── Shared Loading / Error states ──────────────────────────────────────────

export function WeatherLoading({ variant = 'default' }: Readonly<{ variant?: 'compact' | 'default' | 'forecast' }>) {
  if (variant === 'compact') {
    return (
      <Column gap="sm" align="center" justify="center" grow>
        <Skeleton variant="circle" width="32px" height="32px" />
        <Skeleton variant="text" width="60%" />
      </Column>
    );
  }
  if (variant === 'forecast') {
    return (
      <Column gap="md" align="center" justify="center" grow>
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="rect" width="100%" height="80px" />
      </Column>
    );
  }
  return (
    <Column gap="md" align="center" justify="center" grow>
      <Skeleton variant="circle" width="48px" height="48px" />
      <Skeleton variant="text" width="60%" lines={2} />
    </Column>
  );
}

export function WeatherError({ message }: Readonly<{ message: TextContent }>) {
  return (
    <Column gap="sm" align="center" justify="center" grow>
      <Icon name="cloud-off" size="lg" color="muted" />
      <Text content={message} variant="caption" color="muted" align="center" />
    </Column>
  );
}
