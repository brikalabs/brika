import { createContext } from 'react';
import type { WeatherData } from '@/lib/weather';

export const WeatherContext = createContext<WeatherData | null>(null);
