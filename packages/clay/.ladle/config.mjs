// @ts-check

/**
 * Ladle config stub for @brika/clay.
 *
 * PR #4 wires this up with a theme toolbar tied to BUILT_IN_THEMES. For now the
 * file only declares the stories glob so the directory is complete and future
 * stories colocated next to components are discoverable.
 *
 * @type {import('@ladle/react').UserConfig}
 */
export default {
  stories: 'src/**/*.stories.{ts,tsx}',
  defaultStory: 'components-button--default',
};
