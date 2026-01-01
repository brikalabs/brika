import "reflect-metadata";

export {
  container,
  singleton,
  injectable,
  inject,
  Injectable,
  Singleton,
  type DependencyContainer,
  type InjectionToken,
} from "./container";

export { 
  TestBed, 
  spy, 
  mock, 
  autoMock,
  // Legacy exports
  createMock, 
  createSpyFn, 
  createAsyncSpyFn,
  type SpyFn,
} from "./testing";
