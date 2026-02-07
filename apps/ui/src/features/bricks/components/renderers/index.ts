import { ButtonRenderer } from './button';
import { ChartRenderer } from './chart';
import { GridRenderer } from './grid';
import { ImageRenderer } from './image';
import { register } from './registry';
import { SectionRenderer } from './section';
import { SliderRenderer } from './slider';
import { StackRenderer } from './stack';
import { StatValueRenderer } from './stat-value';
import { StatusRenderer } from './status';
import { TextRenderer } from './text';
import { ToggleRenderer } from './toggle';
import { VideoRenderer } from './video';

// Type-safe registration — TS enforces each renderer matches its node type
register('stat-value', StatValueRenderer);
register('toggle', ToggleRenderer);
register('slider', SliderRenderer);
register('chart', ChartRenderer);
register('status', StatusRenderer);
register('text', TextRenderer);
register('image', ImageRenderer);
register('video', VideoRenderer);
register('button', ButtonRenderer);
register('grid', GridRenderer);
register('stack', StackRenderer);
register('section', SectionRenderer);

export type { ActionHandler, NodeRenderer } from './registry';
export { ComponentNodeRenderer, register } from './registry';
