/**
 * HTML entity escape for safe interpolation of untrusted strings into
 * text/html responses.
 *
 * Covers the five OWASP-recommended characters (& < > " ') — enough for
 * any context where the value is being substituted into an HTML *element*
 * body or a quoted attribute value. Do NOT use this for unquoted attribute
 * contexts, JavaScript string contexts, or URL contexts; those need their
 * own escaping disciplines.
 */
export function htmlEscape(value: string): string {
  let out = '';
  for (const ch of value) {
    switch (ch.codePointAt(0)) {
      case 38: // &
        out += '&amp;';
        break;
      case 60: // <
        out += '&lt;';
        break;
      case 62: // >
        out += '&gt;';
        break;
      case 34: // "
        out += '&quot;';
        break;
      case 39: // '
        out += '&#39;';
        break;
      default:
        out += ch;
    }
  }
  return out;
}
