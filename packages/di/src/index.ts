/**
 * @brika/di
 *
 * Dependency injection utilities for Brika.
 *
 * Core DI:
 *   import { container, inject, singleton } from '@brika/di';
 *
 * Testing utilities:
 *   import { TestBed } from '@brika/di/testing';
 */

export {
  container,
  type DependencyContainer,
  type InjectionToken,
  inject,
  injectable,
  singleton,
} from './core';
