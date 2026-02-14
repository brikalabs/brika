import { files } from '../dsl';
import { definePreset } from './define';

export interface ServicePresetOptions {
  /** @default 'src/services' */
  servicesDir?: string;
  /** @default 'src/routes' */
  routesDir?: string;
  /** @default 300 */
  serviceMaxLines?: number;
  /** @default 200 */
  routeMaxLines?: number;
}

/**
 * Preset rules for backend service architecture
 *
 * @example
 * run(
 *   servicePreset({ serviceMaxLines: 400 }),
 *   files('src/utils/*.ts').should().beCamelCase(),
 * );
 */
export const servicePreset = definePreset<ServicePresetOptions>((options = {}) => {
  const {
    servicesDir = 'src/services',
    routesDir = 'src/routes',
    serviceMaxLines = 300,
    routeMaxLines = 200,
  } = options;

  return [
    // Service size and logging
    files(`${servicesDir}/**/*.ts`)
      .should()
      .haveMaxLines(serviceMaxLines)
      .and()
      .notContain(/console\.log/, 'console.log')
      .because('Services should use logger'),

    // Service naming and decorators
    files(`${servicesDir}/*.ts`)
      .should()
      .beCamelCase()
      .and()
      .haveClassDecorator('@singleton')
      .because('Services must be singletons'),

    // Route size limit
    files(`${routesDir}/**/*.ts`)
      .should()
      .haveMaxLines(routeMaxLines)
      .because('Routes should be concise'),

    // Route naming
    files(`${routesDir}/*.ts`).should().beCamelCase(),
  ];
});
