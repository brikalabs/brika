import type { ChartNode } from '@brika/ui-kit';
import { memo } from 'react';
import { BrickChart } from '../BrickChart';

export const ChartRenderer = memo(BrickChart) as React.NamedExoticComponent<{ node: ChartNode }>;
