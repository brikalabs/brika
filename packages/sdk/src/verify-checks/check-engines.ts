import { semver } from 'bun';
import { registerCheck } from './registry';

registerCheck(({ pkg, sdkVersion }) => {
  const { brika: enginesBrika } = pkg.engines;
  if (!semver.satisfies(sdkVersion, enginesBrika)) {
    return {
      errors: [
        `engines.brika "${enginesBrika}" does not cover current SDK version ${sdkVersion}\n      Update engines.brika to e.g. "^${sdkVersion}" or ">=${sdkVersion}"`,
      ],
    };
  }
  return {};
});
