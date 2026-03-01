/**
 * Plugin preference type definitions.
 *
 * Raycast-style configuration system for plugins.
 * Mirrors the Zod PreferenceSchema for runtime validation.
 */

export type PreferenceType =
  | 'text'
  | 'password'
  | 'checkbox'
  | 'dropdown'
  | 'dynamic-dropdown'
  | 'number'
  | 'link';

export interface BasePreference {
  name: string;
  type: PreferenceType;
  label?: string;
  description?: string;
  required?: boolean;
}

export interface TextPreference extends BasePreference {
  type: 'text';
  default?: string;
}

export interface PasswordPreference extends BasePreference {
  type: 'password';
  default?: string;
}

export interface NumberPreference extends BasePreference {
  type: 'number';
  default?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface CheckboxPreference extends BasePreference {
  type: 'checkbox';
  default?: boolean;
}

export interface DropdownPreference extends BasePreference {
  type: 'dropdown';
  default?: string;
  options: Array<{
    value: string;
  }>;
}

export interface DynamicDropdownPreference extends BasePreference {
  type: 'dynamic-dropdown';
  default?: string;
  /** Options resolved server-side via plugin route GET /preferences/{name}. */
  options?: Array<{
    value: string;
    label: string;
  }>;
}

export interface LinkPreference extends BasePreference {
  type: 'link';
  /** URL to open. Relative paths (starting with /) resolve to plugin routes. */
  url: string;
}

export type PreferenceDefinition =
  | TextPreference
  | PasswordPreference
  | NumberPreference
  | CheckboxPreference
  | DropdownPreference
  | DynamicDropdownPreference
  | LinkPreference;
