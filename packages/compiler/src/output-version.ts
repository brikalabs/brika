import { outputVersion } from './output-version.macro' with { type: 'macro' };

/**
 * The compiler's output fingerprint, resolved once at build time (see
 * `output-version.macro`). Single source of truth for both:
 *   - the plugin cache key (`hashPluginSources` mixes it in), and
 *   - the artifact provenance stamp (`bundle/stamp`).
 *
 * It bumps automatically on any compiler / toolchain change, so no version is
 * ever maintained by hand.
 */
export const OUTPUT_VERSION: string = outputVersion();
