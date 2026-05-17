/**
 * `@brika/tui/format` — Minecraft-style inline text formatting for
 * terminal UIs. A tiny parser (`parseFormatCodes`) and an Ink
 * renderer (`<FormattedText>`) — that's it.
 *
 * The two are decoupled: parse once, render many times, or hand a raw
 * string straight to the component for the simple case.
 */

export {
  type FormatColor,
  type FormatSegment,
  type FormatStyle,
  padSegments,
  type ParsedFormat,
  parseFormatCodes,
  PLAIN_STYLE,
} from './codes';
export { FormattedText, type FormattedTextProps } from './FormattedText';
