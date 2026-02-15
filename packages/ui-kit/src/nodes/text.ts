import type { ColorValue } from '../colors';
import type { ActionHandler, BaseNode, IntlRef, TextContent } from './_shared';
import { isI18nRef, isIntlRef, resolveAction, resolveIntlRef } from './_shared';

/** Wire-format node — sent over IPC to the UI renderer. */
export interface TextNode extends BaseNode {
  type: 'text';
  content: string;
  /** When set, the UI renderer resolves this via i18next instead of using content. */
  i18n?: { ns: string; key: string; params?: Record<string, string | number> };
  /** When set, the UI renderer formats this value via Intl APIs with the user's locale. */
  intl?: IntlRef;
  variant?: 'body' | 'caption' | 'heading';
  color?: ColorValue;
  align?: 'left' | 'center' | 'right';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  maxLines?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  onPress?: string;
}

/** Props accepted by the Text() builder. */
export interface TextProps {
  /** Text content — string, I18nRef from t(), or IntlRef from formatters. */
  content?: TextContent;
  /** Alias for content — allows `<Text>hello</Text>` JSX syntax. */
  children?: TextContent;
  variant?: 'body' | 'caption' | 'heading';
  color?: ColorValue;
  align?: 'left' | 'center' | 'right';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  maxLines?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  onPress?: ActionHandler;
}

export function Text(props: TextProps): TextNode {
  const { onPress, children, content: contentProp, ...rest } = props;
  const content = contentProp ?? children ?? '';
  const press = onPress ? resolveAction(onPress) : undefined;
  if (isI18nRef(content)) {
    return {
      type: 'text', ...rest, content: content.key,
      i18n: { ns: content.ns, key: content.key, params: content.params },
      onPress: press,
    };
  }
  if (isIntlRef(content)) {
    return { type: 'text', ...rest, content: resolveIntlRef(content), intl: content, onPress: press };
  }
  return { type: 'text', ...rest, content, onPress: press };
}

declare module './_shared' {
  interface NodeTypeMap {
    text: TextNode;
  }
}
