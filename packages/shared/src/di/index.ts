import 'reflect-metadata';

export {
  container,
  type DependencyContainer,
  type InjectionToken,
  inject,
  injectable,
  singleton,
} from './container';

export {
  autoMock,
  mock,
  type SpyFn,
  spy,
  TestBed,
} from './testing';
