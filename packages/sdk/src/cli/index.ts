/**
 * The author-side `brika` commands. They live in @brika/sdk so a plugin needs
 * only its single @brika/sdk dependency to build/check/verify in scripts and CI.
 * Re-exported here so @brika/console can register the SAME command modules in
 * the full hub CLI: one implementation, two distributions.
 *
 * These modules import the build toolchain (@brika/compiler, @brika/cli), which
 * is a devDependency of @brika/sdk and is INLINED into the published `brika` bin
 * (dist/bin/brika.js) at pack time. So this entry is for the workspace console
 * and the bin build only; it is not part of a plugin's runtime install closure.
 */

export { default as build, runBuild } from './commands/build';
export { default as check, scanBoundary } from './commands/check';
export { default as verify } from './commands/verify';
