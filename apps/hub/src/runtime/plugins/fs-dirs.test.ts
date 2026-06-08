import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { pluginFsDirs } from './fs-dirs';

describe('pluginFsDirs', () => {
  test('maps the writable roots under <brikaDir>/plugins-data/<uid>/', () => {
    const dirs = pluginFsDirs('/home/.brika', 'abc123', '/opt/plugins/demo');
    expect(dirs).toEqual({
      bundle: '/opt/plugins/demo',
      data: join('/home/.brika', 'plugins-data', 'abc123', 'data'),
      cache: join('/home/.brika', 'plugins-data', 'abc123', 'cache'),
      tmp: join('/home/.brika', 'plugins-data', 'abc123', 'tmp'),
    });
  });

  test('bundle points at the install dir (rootDirectory), not the data tree', () => {
    const dirs = pluginFsDirs('/data', 'uid', '/install/here');
    expect(dirs.bundle).toBe('/install/here');
    expect(dirs.data).not.toContain('/install/here');
  });

  test('is pure — resolving a nonexistent brikaDir neither throws nor touches disk', () => {
    const dirs = pluginFsDirs('/nonexistent/xyz', 'uid', '/root');
    expect(dirs.data).toBe(join('/nonexistent/xyz', 'plugins-data', 'uid', 'data'));
  });
});
