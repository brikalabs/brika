import { semver } from 'bun';
import { registerCheck } from './registry';

registerCheck(({ pkg, sdkVersion }) => {
  const { brika: enginesBrika } = pkg.engines;
  if (!semver.satisfies(sdkVersion, enginesBrika)) {
    const message = `engines.brika "${enginesBrika}" does not cover current SDK version ${sdkVersion}\n      Update engines.brika to e.g. "^${sdkVersion}" or ">=${sdkVersion}"`;
    return {
      errors: [message],
      suggestions: [
        {
          for: message,
          description: `Set engines.brika to a range that covers ${sdkVersion}`,
          snippet: `"engines": { "brika": "^${sdkVersion}" }`,
          language: 'json',
        },
      ],
    };
  }
  return {};
});
