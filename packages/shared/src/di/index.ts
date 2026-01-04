import 'reflect-metadata';

export {
  container,
  type DependencyContainer,
  Injectable,
  type InjectionToken,
  inject,
  injectable,
  Singleton,
  singleton,
} from './container';

export {
  autoMock,
  mock,
  type SpyFn,
  spy,
  TestBed,
} from './testing';
