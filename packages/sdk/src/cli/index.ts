/**
 * The author-side `brika` commands. A plugin gets them through the `brika` bin
 * (dist/bin/brika.js), shipped via @brika/sdk's `bin` field, so a single
 * @brika/sdk devDependency is enough to build/check/verify in scripts and CI.
 * This module re-exports the SAME command objects so @brika/console can register
 * them in the full hub CLI: one implementation, two distributions.
 *
 * These modules import the build toolchain (@brika/compiler, @brika/cli,
 * @brika/schema), a devDependency of @brika/sdk that is INLINED into the bin at
 * pack time. The toolchain is private, so importing this module from npm would
 * fail to resolve it. That is why this entry is exposed only under the
 * `./internal/cli` subpath, which the publisher strips from the released
 * manifest: it serves the workspace console and the bin build, never a consumer.
 */

export { default as build, runBuild } from './commands/build';
export { default as check, scanBoundary } from './commands/check';
export { default as verify } from './commands/verify';
