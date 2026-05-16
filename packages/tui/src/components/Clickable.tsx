/**
 * `<Clickable>` — alias for `<Focusable>` kept for callsites that
 * read more naturally as "wrap this content to make it clickable".
 *
 *   <Clickable onPress={() => open(item)}><Card>…</Card></Clickable>
 *
 * Functionally identical to `<Focusable>`. Use whichever name reads
 * better at the callsite — there is no behavioural difference.
 */

export { Focusable as Clickable, type FocusableProps as ClickableProps } from './Focusable';
