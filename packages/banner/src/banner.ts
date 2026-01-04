import boxen from 'boxen';
import chalk from 'chalk';
import figlet from 'figlet';

export interface BannerOptions {
  /** Main title displayed as ASCII art */
  title: string;
  /** Subtitle displayed below the ASCII art */
  subtitle: string;
  /** Additional metadata to display (e.g., version, package name) */
  metadata: Record<string, string>;
  /** Font style for ASCII art (default: 'Slant') */
  font?: string;
  /** Border style (default: 'double') */
  borderStyle?: boxen.BorderStyle;
  /** Border color (default: 'cyan') */
  borderColor?: string;
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
 *   title: 'EliaHub',
 *   subtitle: 'Event-driven Logical Intelligence Architecture',
 *   metadata: {
 *     Version: '0.1.0',
 *     Package: '@elia/hub',
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

  // Add metadata entries
  for (const [key, value] of Object.entries(metadata)) {
    contentParts.push(`${chalk.yellow(`${key}:`)} ${chalk.bold(value)}`);
  }

  const content = contentParts.join('\n');

  return boxen(content, {
    padding,
    margin,
    borderStyle,
    borderColor: borderColor as boxen.Color,
  });
}
