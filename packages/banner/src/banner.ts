import boxen, { type Options as BoxenOptions } from 'boxen';
import chalk from 'chalk';
import figlet, { type FontName } from 'figlet';
import SlantFont from 'figlet/fonts/Slant';

figlet.parseFont('Slant', SlantFont);

export interface BannerOptions {
  /** Main title displayed as ASCII art */
  title: string;
  /** Subtitle displayed below the ASCII art */
  subtitle: string;
  /** Additional metadata to display (e.g., version, package name) */
  metadata: Record<string, string>;
  /** Font style for ASCII art (default: 'Slant') */
  font?: FontName;
  /** Border style (default: 'double') */
  borderStyle?: BoxenOptions['borderStyle'];
  /** Border color (default: 'cyan') */
  borderColor?: BoxenOptions['borderColor'];
  /** Padding inside the box (default: 1) */
  padding?: number;
  /** Margin around the box (default: 1) */
  margin?: number;
}

/**
 * Creates a formatted startup banner with ASCII art, subtitle, and metadata.
 *
 * @example
 * ```ts
 * const banner = createBanner({
 *   title: 'BRIKA',
 *   subtitle: 'Build. Run. Integrate. Keep Automating.',
 *   metadata: {
 *     Version: '0.1.0',
 *     Package: '@brika/hub',
 *   },
 * });
 * console.log(banner);
 * ```
 */
export function createBanner(options: BannerOptions): string {
  const {
    title,
    subtitle,
    metadata,
    font = 'Slant',
    borderStyle = 'double',
    borderColor = 'cyan',
    padding = 1,
    margin = 1,
  } = options;

  const asciiArt = figlet.textSync(title, {
    font,
    horizontalLayout: 'fitted',
    verticalLayout: 'default',
  });

  const contentParts: string[] = [chalk.cyan.bold(asciiArt), chalk.green(subtitle), ''];

  for (const [key, value] of Object.entries(metadata)) {
    const label = chalk.yellow(`${key}:`);
    contentParts.push(`${label} ${chalk.bold(value)}`);
  }

  const content = contentParts.join('\n');

  return boxen(content, {
    padding,
    margin,
    borderStyle,
    borderColor,
  });
}
