/**
 * Tests for all node builder functions and _shared utilities.
 *
 * Covers:
 * - _shared.ts: normalizeChildren, resolveAction, _setActionRegistrar
 * - Simple spread factories: Badge, Chart, Divider, Icon, Image, Progress, Spacer, Stat, Status, Text, Video
 * - Container factories: Box, Grid, Section, Row, Column
 * - Action-resolving factories: Button, Slider, Toggle, Checkbox, Tabs, Select, TextInput
 * - New components: Avatar, CodeBlock, KeyValue, Link, Skeleton, Table
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import {
  _setActionRegistrar,
  Avatar,
  Badge,
  Box,
  Button,
  Callout,
  Chart,
  Checkbox,
  CodeBlock,
  Column,
  Divider,
  Grid,
  Icon,
  Image,
  KeyValue,
  Link,
  normalizeChildren,
  Progress,
  Row,
  resolveAction,
  Section,
  Select,
  Skeleton,
  Slider,
  Spacer,
  Stat,
  Status,
  Table,
  Tabs,
  Text,
  TextInput,
  Toggle,
  Video,
} from '../nodes';

// ─────────────────────────────────────────────────────────────────────────────
// _shared utilities
// ─────────────────────────────────────────────────────────────────────────────

describe('_shared', () => {
  describe('normalizeChildren', () => {
    test('returns empty array for null', () => {
      expect(normalizeChildren(null)).toEqual([]);
    });

    test('returns empty array for undefined', () => {
      expect(normalizeChildren(undefined)).toEqual([]);
    });

    test('returns empty array for false', () => {
      expect(normalizeChildren(false)).toEqual([]);
    });

    test('wraps a single ComponentNode in an array', () => {
      const node = Text({ content: 'hello' });
      const result = normalizeChildren(node);
      expect(result).toEqual([node]);
    });

    test('returns flat array from array of nodes', () => {
      const a = Text({ content: 'a' });
      const b = Text({ content: 'b' });
      expect(normalizeChildren([a, b])).toEqual([a, b]);
    });

    test('flattens nested arrays', () => {
      const a = Text({ content: 'a' });
      const b = Text({ content: 'b' });
      expect(normalizeChildren([[a], [b]])).toEqual([a, b]);
    });

    test('filters out null, undefined, and false from arrays', () => {
      const a = Text({ content: 'a' });
      const result = normalizeChildren([a, null, undefined, false]);
      expect(result).toEqual([a]);
    });

    test('handles empty array', () => {
      expect(normalizeChildren([])).toEqual([]);
    });

    test('handles array of only falsy values', () => {
      expect(normalizeChildren([null, false, undefined])).toEqual([]);
    });
  });

  describe('resolveAction', () => {
    beforeEach(() => {
      _setActionRegistrar(null);
    });

    test('returns fallback action ID when no registrar is set', () => {
      const handler = () => {};
      const id = resolveAction(handler);
      expect(id).toMatch(/^__action_\d+$/);
    });

    test('increments fallback counter on subsequent calls', () => {
      const id1 = resolveAction(() => {});
      const id2 = resolveAction(() => {});
      // Extract numbers and ensure id2 > id1
      const n1 = Number(id1.replace('__action_', ''));
      const n2 = Number(id2.replace('__action_', ''));
      expect(n2).toBe(n1 + 1);
    });

    test('delegates to custom registrar when set', () => {
      let capturedHandler: unknown = null;
      _setActionRegistrar((handler) => {
        capturedHandler = handler;
        return 'custom-id-42';
      });

      const myHandler = () => {};
      const id = resolveAction(myHandler);
      expect(id).toBe('custom-id-42');
      expect(capturedHandler).toBe(myHandler);
    });

    test('clearing the registrar restores fallback behavior', () => {
      _setActionRegistrar(() => 'custom');
      expect(resolveAction(() => {})).toBe('custom');

      _setActionRegistrar(null);
      const id = resolveAction(() => {});
      expect(id).toMatch(/^__action_\d+$/);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Simple spread factories
// ─────────────────────────────────────────────────────────────────────────────

describe('Text', () => {
  test('creates text node with required content', () => {
    const node = Text({ content: 'Hello' });
    expect(node).toEqual({ type: 'text', content: 'Hello' });
  });

  test('includes optional variant', () => {
    const node = Text({ content: 'Title', variant: 'heading' });
    expect(node.type).toBe('text');
    expect(node.content).toBe('Title');
    expect(node.variant).toBe('heading');
  });

  test('includes optional color', () => {
    const node = Text({ content: 'red', color: '#ff0000' });
    expect(node.color).toBe('#ff0000');
  });

  test('all variant values work', () => {
    for (const v of ['body', 'caption', 'heading'] as const) {
      expect(Text({ content: '', variant: v }).variant).toBe(v);
    }
  });
});

describe('Badge', () => {
  test('creates badge node with required label', () => {
    const node = Badge({ label: 'New' });
    expect(node).toEqual({ type: 'badge', label: 'New' });
  });

  test('includes optional variant', () => {
    const node = Badge({ label: 'OK', variant: 'success' });
    expect(node.type).toBe('badge');
    expect(node.variant).toBe('success');
  });

  test('includes optional icon and color', () => {
    const node = Badge({ label: 'Warn', icon: 'alert-triangle', color: '#f00' });
    expect(node.icon).toBe('alert-triangle');
    expect(node.color).toBe('#f00');
  });

  test('all variant values work', () => {
    for (const v of [
      'default',
      'secondary',
      'outline',
      'success',
      'warning',
      'destructive',
    ] as const) {
      expect(Badge({ label: '', variant: v }).variant).toBe(v);
    }
  });
});

describe('Chart', () => {
  const sampleData = [
    { ts: 1000, value: 10 },
    { ts: 2000, value: 20 },
  ];

  test('creates chart node with required fields', () => {
    const node = Chart({ variant: 'line', data: sampleData });
    expect(node.type).toBe('chart');
    expect(node.variant).toBe('line');
    expect(node.data).toEqual(sampleData);
  });

  test('includes optional fields', () => {
    const node = Chart({
      variant: 'bar',
      data: sampleData,
      color: '#00ff00',
      label: 'Revenue',
      height: 200,
    });
    expect(node.color).toBe('#00ff00');
    expect(node.label).toBe('Revenue');
    expect(node.height).toBe(200);
  });

  test('all variant values work', () => {
    for (const v of ['line', 'area', 'bar'] as const) {
      expect(Chart({ variant: v, data: [] }).variant).toBe(v);
    }
  });
});

describe('Divider', () => {
  test('creates divider node with no props', () => {
    const node = Divider();
    expect(node.type).toBe('divider');
  });

  test('accepts direction', () => {
    expect(Divider({ direction: 'horizontal' }).direction).toBe('horizontal');
    expect(Divider({ direction: 'vertical' }).direction).toBe('vertical');
  });

  test('accepts color', () => {
    const node = Divider({ color: '#ccc' });
    expect(node.color).toBe('#ccc');
  });
});

describe('Icon', () => {
  test('creates icon node with required name', () => {
    const node = Icon({ name: 'star' });
    expect(node).toEqual({ type: 'icon', name: 'star' });
  });

  test('includes optional size and color', () => {
    const node = Icon({ name: 'heart', size: 'lg', color: 'red' });
    expect(node.size).toBe('lg');
    expect(node.color).toBe('red');
  });

  test('all size values work', () => {
    for (const s of ['sm', 'md', 'lg'] as const) {
      expect(Icon({ name: 'x', size: s }).size).toBe(s);
    }
  });
});

describe('Image', () => {
  test('creates image node with required src', () => {
    const node = Image({ src: 'https://img.example.com/a.png' });
    expect(node.type).toBe('image');
    expect(node.src).toBe('https://img.example.com/a.png');
  });

  test('includes all optional fields', () => {
    const node = Image({
      src: 'pic.jpg',
      alt: 'A picture',
      width: 100,
      height: '50%',
      fit: 'cover',
      rounded: true,
      aspectRatio: '16/9',
      caption: 'Nice pic',
    });
    expect(node.alt).toBe('A picture');
    expect(node.width).toBe(100);
    expect(node.height).toBe('50%');
    expect(node.fit).toBe('cover');
    expect(node.rounded).toBe(true);
    expect(node.aspectRatio).toBe('16/9');
    expect(node.caption).toBe('Nice pic');
  });

  test('width/height accept both number and string', () => {
    const n1 = Image({ src: 'a', width: 200, height: 100 });
    expect(n1.width).toBe(200);
    expect(n1.height).toBe(100);

    const n2 = Image({ src: 'a', width: '30%', height: '50%' });
    expect(n2.width).toBe('30%');
    expect(n2.height).toBe('50%');
  });
});

describe('Progress', () => {
  test('creates progress node with required value', () => {
    const node = Progress({ value: 42 });
    expect(node).toEqual({ type: 'progress', value: 42 });
  });

  test('includes optional fields', () => {
    const node = Progress({
      value: 75,
      label: 'Upload',
      color: 'blue',
      showValue: true,
    });
    expect(node.label).toBe('Upload');
    expect(node.color).toBe('blue');
    expect(node.showValue).toBe(true);
  });

  test('handles boundary values', () => {
    expect(Progress({ value: 0 }).value).toBe(0);
    expect(Progress({ value: 100 }).value).toBe(100);
  });
});

describe('Spacer', () => {
  test('creates spacer node with no props', () => {
    const node = Spacer();
    expect(node.type).toBe('spacer');
  });

  test('accepts size', () => {
    for (const s of ['sm', 'md', 'lg'] as const) {
      expect(Spacer({ size: s }).size).toBe(s);
    }
  });

  test('omits size when not specified', () => {
    const node = Spacer();
    expect(node.size).toBeUndefined();
  });
});

describe('Stat', () => {
  test('creates stat-value node with required label and value', () => {
    const node = Stat({ label: 'Temp', value: 21.5 });
    expect(node.type).toBe('stat-value');
    expect(node.label).toBe('Temp');
    expect(node.value).toBe(21.5);
  });

  test('value can be a string', () => {
    const node = Stat({ label: 'Status', value: 'OK' });
    expect(node.value).toBe('OK');
  });

  test('includes all optional fields', () => {
    const node = Stat({
      label: 'Sales',
      value: 1234,
      unit: '$',
      icon: 'dollar-sign',
      trend: 'up',
      color: 'green',
    });
    expect(node.unit).toBe('$');
    expect(node.icon).toBe('dollar-sign');
    expect(node.trend).toBe('up');
    expect(node.color).toBe('green');
  });

  test('all trend values work', () => {
    for (const t of ['up', 'down', 'flat'] as const) {
      expect(Stat({ label: '', value: 0, trend: t }).trend).toBe(t);
    }
  });
});

describe('Status', () => {
  test('creates status node with required label and status', () => {
    const node = Status({ label: 'Server', status: 'online' });
    expect(node.type).toBe('status');
    expect(node.label).toBe('Server');
    expect(node.status).toBe('online');
  });

  test('includes optional icon and color', () => {
    const node = Status({ label: 'DB', status: 'error', icon: 'database', color: '#f00' });
    expect(node.icon).toBe('database');
    expect(node.color).toBe('#f00');
  });

  test('all status values work', () => {
    for (const s of ['online', 'offline', 'warning', 'error', 'idle'] as const) {
      expect(Status({ label: '', status: s }).status).toBe(s);
    }
  });
});

describe('Video', () => {
  test('creates video node with required fields', () => {
    const node = Video({ src: 'https://stream.example.com/live.m3u8', format: 'hls' });
    expect(node.type).toBe('video');
    expect(node.src).toBe('https://stream.example.com/live.m3u8');
    expect(node.format).toBe('hls');
  });

  test('includes optional fields', () => {
    const node = Video({
      src: 'cam.mjpeg',
      format: 'mjpeg',
      poster: 'thumb.jpg',
      aspectRatio: '4/3',
      muted: true,
    });
    expect(node.poster).toBe('thumb.jpg');
    expect(node.aspectRatio).toBe('4/3');
    expect(node.muted).toBe(true);
  });

  test('both format values work', () => {
    expect(Video({ src: '', format: 'hls' }).format).toBe('hls');
    expect(Video({ src: '', format: 'mjpeg' }).format).toBe('mjpeg');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Container factories (use normalizeChildren)
// ─────────────────────────────────────────────────────────────────────────────

describe('Box', () => {
  test('creates box node with empty children by default', () => {
    const node = Box({});
    expect(node.type).toBe('box');
    expect(node.children).toEqual([]);
  });

  test('normalizes single child', () => {
    const child = Text({ content: 'hi' });
    const node = Box({ children: child });
    expect(node.children).toEqual([child]);
  });

  test('normalizes array children', () => {
    const a = Text({ content: 'a' });
    const b = Text({ content: 'b' });
    const node = Box({ children: [a, b] });
    expect(node.children).toEqual([a, b]);
  });

  test('filters out falsy children', () => {
    const a = Text({ content: 'a' });
    const node = Box({ children: [a, null, false, undefined] });
    expect(node.children).toEqual([a]);
  });

  test('includes all optional props', () => {
    const node = Box({
      background: '#333',
      backgroundImage: 'bg.jpg',
      backgroundFit: 'cover',
      backgroundPosition: 'center',
      blur: 'md',
      opacity: 0.8,
      padding: 'lg',
      rounded: 'sm',
      grow: true,
    });
    expect(node.background).toBe('#333');
    expect(node.backgroundImage).toBe('bg.jpg');
    expect(node.backgroundFit).toBe('cover');
    expect(node.backgroundPosition).toBe('center');
    expect(node.blur).toBe('md');
    expect(node.opacity).toBe(0.8);
    expect(node.padding).toBe('lg');
    expect(node.rounded).toBe('sm');
    expect(node.grow).toBe(true);
  });

  test('does not leak children into rest props', () => {
    const node = Box({ children: Text({ content: 'x' }), padding: 'sm' });
    // The children key should be the normalized array, not the raw input
    expect(Array.isArray(node.children)).toBe(true);
    expect(node.padding).toBe('sm');
  });
});

describe('Grid', () => {
  test('creates grid node with empty children by default', () => {
    const node = Grid({});
    expect(node.type).toBe('grid');
    expect(node.children).toEqual([]);
  });

  test('normalizes children', () => {
    const a = Text({ content: 'a' });
    const b = Text({ content: 'b' });
    const node = Grid({ children: [a, b] });
    expect(node.children).toEqual([a, b]);
  });

  test('includes optional fields', () => {
    const node = Grid({
      columns: 3,
      gap: 'md',
      autoFit: true,
      minColumnWidth: 200,
    });
    expect(node.columns).toBe(3);
    expect(node.gap).toBe('md');
    expect(node.autoFit).toBe(true);
    expect(node.minColumnWidth).toBe(200);
  });

  test('filters falsy children', () => {
    const a = Text({ content: 'a' });
    const node = Grid({ children: [a, null, false] });
    expect(node.children).toEqual([a]);
  });
});

describe('Section', () => {
  test('creates section node with title and empty children', () => {
    const node = Section({ title: 'Settings' });
    expect(node.type).toBe('section');
    expect(node.title).toBe('Settings');
    expect(node.children).toEqual([]);
  });

  test('normalizes children', () => {
    const child = Text({ content: 'hello' });
    const node = Section({ title: 'Main', children: child });
    expect(node.children).toEqual([child]);
  });

  test('normalizes array children with falsy values', () => {
    const a = Text({ content: 'a' });
    const node = Section({ title: 'S', children: [a, null, false] });
    expect(node.children).toEqual([a]);
  });
});

describe('Row', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('creates row node with empty children by default', () => {
    const node = Row({});
    expect(node.type).toBe('row');
    expect(node.children).toEqual([]);
  });

  test('normalizes children', () => {
    const a = Text({ content: 'a' });
    const b = Text({ content: 'b' });
    const node = Row({ children: [a, b] });
    expect(node.children).toEqual([a, b]);
  });

  test('includes all FlexLayoutProps', () => {
    const node = Row({
      gap: 'lg',
      align: 'center',
      justify: 'between',
      wrap: true,
      grow: true,
    });
    expect(node.gap).toBe('lg');
    expect(node.align).toBe('center');
    expect(node.justify).toBe('between');
    expect(node.wrap).toBe(true);
    expect(node.grow).toBe(true);
  });

  test('resolves onPress to action ID', () => {
    const node = Row({ onPress: () => {} });
    expect(node.onPress).toMatch(/^__action_\d+$/);
  });

  test('filters falsy children', () => {
    const a = Text({ content: 'a' });
    const node = Row({ children: [a, null, undefined, false] });
    expect(node.children).toEqual([a]);
  });
});

describe('Column', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('creates column node with empty children by default', () => {
    const node = Column({});
    expect(node.type).toBe('column');
    expect(node.children).toEqual([]);
  });

  test('normalizes children', () => {
    const a = Text({ content: 'a' });
    const b = Text({ content: 'b' });
    const node = Column({ children: [a, b] });
    expect(node.children).toEqual([a, b]);
  });

  test('includes all FlexLayoutProps', () => {
    const node = Column({
      gap: 'sm',
      align: 'stretch',
      justify: 'around',
      wrap: false,
      grow: true,
    });
    expect(node.gap).toBe('sm');
    expect(node.align).toBe('stretch');
    expect(node.justify).toBe('around');
    expect(node.wrap).toBe(false);
    expect(node.grow).toBe(true);
  });

  test('resolves onPress to action ID', () => {
    const node = Column({ onPress: () => {} });
    expect(node.onPress).toMatch(/^__action_\d+$/);
  });

  test('filters falsy children', () => {
    const a = Text({ content: 'a' });
    const node = Column({ children: [a, null, undefined, false] });
    expect(node.children).toEqual([a]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Action-resolving factories
// ─────────────────────────────────────────────────────────────────────────────

describe('Button', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('creates button node with label only', () => {
    const node = Button({ label: 'Click me' });
    expect(node.type).toBe('button');
    expect(node.label).toBe('Click me');
    expect(node.onPress).toBeUndefined();
  });

  test('resolves onPress handler to an action ID', () => {
    const handler = () => {};
    const node = Button({ label: 'Go', onPress: handler });
    expect(node.type).toBe('button');
    expect(node.onPress).toMatch(/^__action_\d+$/);
  });

  test('uses custom registrar for onPress', () => {
    _setActionRegistrar(() => 'btn-action-1');
    const node = Button({ label: 'Go', onPress: () => {} });
    expect(node.onPress).toBe('btn-action-1');
  });

  test('includes url without onPress', () => {
    const node = Button({ label: 'Link', url: 'https://example.com' });
    expect(node.url).toBe('https://example.com');
    expect(node.onPress).toBeUndefined();
  });

  test('includes optional icon, variant, color', () => {
    const node = Button({
      label: 'Delete',
      icon: 'trash',
      variant: 'destructive',
      color: '#f00',
      onPress: () => {},
    });
    expect(node.icon).toBe('trash');
    expect(node.variant).toBe('destructive');
    expect(node.color).toBe('#f00');
  });

  test('all variant values work', () => {
    for (const v of ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const) {
      expect(Button({ variant: v }).variant).toBe(v);
    }
  });
});

describe('Slider', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('creates slider node with required fields', () => {
    const handler = () => {};
    const node = Slider({ value: 50, min: 0, max: 100, onChange: handler });
    expect(node.type).toBe('slider');
    expect(node.value).toBe(50);
    expect(node.min).toBe(0);
    expect(node.max).toBe(100);
    expect(node.onChange).toMatch(/^__action_\d+$/);
  });

  test('uses custom registrar for onChange', () => {
    _setActionRegistrar(() => 'slider-action-1');
    const node = Slider({ value: 10, min: 0, max: 20, onChange: () => {} });
    expect(node.onChange).toBe('slider-action-1');
  });

  test('includes all optional fields', () => {
    const node = Slider({
      value: 5,
      min: 0,
      max: 10,
      step: 0.5,
      unit: 'kg',
      label: 'Weight',
      icon: 'scale',
      color: '#0f0',
      onChange: () => {},
    });
    expect(node.step).toBe(0.5);
    expect(node.unit).toBe('kg');
    expect(node.label).toBe('Weight');
    expect(node.icon).toBe('scale');
    expect(node.color).toBe('#0f0');
  });
});

describe('Toggle', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('creates toggle node with required fields', () => {
    const handler = () => {};
    const node = Toggle({ label: 'Dark mode', checked: false, onToggle: handler });
    expect(node.type).toBe('toggle');
    expect(node.label).toBe('Dark mode');
    expect(node.checked).toBe(false);
    expect(node.onToggle).toMatch(/^__action_\d+$/);
  });

  test('checked can be true', () => {
    const node = Toggle({ label: 'On', checked: true, onToggle: () => {} });
    expect(node.checked).toBe(true);
  });

  test('uses custom registrar for onToggle', () => {
    _setActionRegistrar(() => 'toggle-action-1');
    const node = Toggle({ label: 'LED', checked: true, onToggle: () => {} });
    expect(node.onToggle).toBe('toggle-action-1');
  });

  test('includes optional icon and color', () => {
    const node = Toggle({
      label: 'Mute',
      checked: false,
      onToggle: () => {},
      icon: 'volume-x',
      color: 'orange',
    });
    expect(node.icon).toBe('volume-x');
    expect(node.color).toBe('orange');
  });

  test('includes disabled prop', () => {
    const node = Toggle({ label: 'Off', checked: false, onToggle: () => {}, disabled: true });
    expect(node.disabled).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// New props on existing components
// ─────────────────────────────────────────────────────────────────────────────

describe('Text (new props)', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('includes align and weight', () => {
    const node = Text({ content: 'hi', align: 'center', weight: 'bold' });
    expect(node.align).toBe('center');
    expect(node.weight).toBe('bold');
  });

  test('includes truncate and maxLines', () => {
    const node = Text({ content: 'long', truncate: true, maxLines: 3 });
    expect(node.truncate).toBe(true);
    expect(node.maxLines).toBe(3);
  });

  test('includes size', () => {
    for (const s of ['xs', 'sm', 'md', 'lg', 'xl'] as const) {
      expect(Text({ content: '', size: s }).size).toBe(s);
    }
  });

  test('resolves onPress to action ID', () => {
    const node = Text({ content: 'click', onPress: () => {} });
    expect(node.onPress).toMatch(/^__action_\d+$/);
  });

  test('omits onPress when not provided', () => {
    const node = Text({ content: 'plain' });
    expect(node.onPress).toBeUndefined();
  });
});

describe('Button (new props)', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('includes disabled and loading', () => {
    const node = Button({ label: 'Go', disabled: true, loading: true });
    expect(node.disabled).toBe(true);
    expect(node.loading).toBe(true);
  });

  test('includes size and fullWidth', () => {
    const node = Button({ label: 'Big', size: 'lg', fullWidth: true });
    expect(node.size).toBe('lg');
    expect(node.fullWidth).toBe(true);
  });
});

describe('Stat (new props)', () => {
  test('includes trendValue and description', () => {
    const node = Stat({ label: 'Rev', value: 100, trendValue: '+5.2%', description: 'Monthly' });
    expect(node.trendValue).toBe('+5.2%');
    expect(node.description).toBe('Monthly');
  });
});

describe('Divider (new props)', () => {
  test('includes label', () => {
    const node = Divider({ label: 'OR' });
    expect(node.label).toBe('OR');
  });
});

describe('Badge (onPress)', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('resolves onPress to action ID', () => {
    const node = Badge({ label: 'Tag', onPress: () => {} });
    expect(node.onPress).toMatch(/^__action_\d+$/);
  });

  test('omits onPress when not provided', () => {
    const node = Badge({ label: 'Static' });
    expect(node.onPress).toBeUndefined();
  });
});

describe('Icon (onPress)', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('resolves onPress to action ID', () => {
    const node = Icon({ name: 'star', onPress: () => {} });
    expect(node.onPress).toMatch(/^__action_\d+$/);
  });

  test('omits onPress when not provided', () => {
    const node = Icon({ name: 'star' });
    expect(node.onPress).toBeUndefined();
  });
});

describe('Slider (disabled)', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('includes disabled prop', () => {
    const node = Slider({ value: 5, min: 0, max: 10, onChange: () => {}, disabled: true });
    expect(node.disabled).toBe(true);
  });
});

describe('Section (new props)', () => {
  test('includes gap and icon', () => {
    const node = Section({ title: 'Info', gap: 'lg', icon: 'settings' });
    expect(node.gap).toBe('lg');
    expect(node.icon).toBe('settings');
  });
});

describe('Video (new props)', () => {
  test('includes controls and loop', () => {
    const node = Video({ src: 'test.m3u8', format: 'hls', controls: true, loop: true });
    expect(node.controls).toBe(true);
    expect(node.loop).toBe(true);
  });
});

describe('Progress (new props)', () => {
  test('includes size and variant', () => {
    const node = Progress({ value: 50, size: 'lg', variant: 'ring' });
    expect(node.size).toBe('lg');
    expect(node.variant).toBe('ring');
  });

  test('all size values work', () => {
    for (const s of ['sm', 'md', 'lg'] as const) {
      expect(Progress({ value: 50, size: s }).size).toBe(s);
    }
  });
});

describe('Chart (new props)', () => {
  test('includes series', () => {
    const series = [
      { key: 'temp', data: [{ ts: 1, value: 20 }], color: 'red' },
      { key: 'humidity', label: 'Humid', data: [{ ts: 1, value: 60 }] },
    ];
    const node = Chart({ variant: 'line', data: [], series });
    expect(node.series).toEqual(series);
  });

  test('includes axis and grid controls', () => {
    const node = Chart({
      variant: 'area',
      data: [],
      showXAxis: true,
      showYAxis: true,
      showGrid: true,
      showLegend: true,
    });
    expect(node.showXAxis).toBe(true);
    expect(node.showYAxis).toBe(true);
    expect(node.showGrid).toBe(true);
    expect(node.showLegend).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// New components
// ─────────────────────────────────────────────────────────────────────────────

describe('Callout', () => {
  test('creates callout with required fields', () => {
    const node = Callout({ variant: 'info', message: 'Hello' });
    expect(node.type).toBe('callout');
    expect(node.variant).toBe('info');
    expect(node.message).toBe('Hello');
  });

  test('includes optional title and icon', () => {
    const node = Callout({
      variant: 'warning',
      message: 'Watch out',
      title: 'Heads up',
      icon: 'zap',
    });
    expect(node.title).toBe('Heads up');
    expect(node.icon).toBe('zap');
  });

  test('all variant values work', () => {
    for (const v of ['info', 'warning', 'error', 'success'] as const) {
      expect(Callout({ variant: v, message: '' }).variant).toBe(v);
    }
  });
});

describe('TextInput', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('creates text-input with required fields', () => {
    const node = TextInput({ value: 'hello', onChange: () => {} });
    expect(node.type).toBe('text-input');
    expect(node.value).toBe('hello');
    expect(node.onChange).toMatch(/^__action_\d+$/);
  });

  test('resolves onSubmit when provided', () => {
    const node = TextInput({ value: '', onChange: () => {}, onSubmit: () => {} });
    expect(node.onSubmit).toMatch(/^__action_\d+$/);
  });

  test('omits onSubmit when not provided', () => {
    const node = TextInput({ value: '', onChange: () => {} });
    expect(node.onSubmit).toBeUndefined();
  });

  test('includes all optional props', () => {
    const node = TextInput({
      value: '',
      onChange: () => {},
      placeholder: 'Type here',
      label: 'Name',
      icon: 'user',
      disabled: true,
      inputType: 'email',
    });
    expect(node.placeholder).toBe('Type here');
    expect(node.label).toBe('Name');
    expect(node.icon).toBe('user');
    expect(node.disabled).toBe(true);
    expect(node.inputType).toBe('email');
  });

  test('all inputType values work', () => {
    for (const t of ['text', 'password', 'email', 'number'] as const) {
      expect(TextInput({ value: '', onChange: () => {}, inputType: t }).inputType).toBe(t);
    }
  });
});

describe('Select', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  const opts = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ];

  test('creates select with required fields', () => {
    const node = Select({ value: 'a', options: opts, onChange: () => {} });
    expect(node.type).toBe('select');
    expect(node.value).toBe('a');
    expect(node.options).toEqual(opts);
    expect(node.onChange).toMatch(/^__action_\d+$/);
  });

  test('includes all optional props', () => {
    const node = Select({
      value: 'a',
      options: opts,
      onChange: () => {},
      label: 'Pick one',
      placeholder: 'Choose…',
      disabled: true,
      icon: 'list',
    });
    expect(node.label).toBe('Pick one');
    expect(node.placeholder).toBe('Choose…');
    expect(node.disabled).toBe(true);
    expect(node.icon).toBe('list');
  });

  test('uses custom registrar for onChange', () => {
    _setActionRegistrar(() => 'sel-action');
    const node = Select({ value: 'a', options: opts, onChange: () => {} });
    expect(node.onChange).toBe('sel-action');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// New components (Row/Column era)
// ─────────────────────────────────────────────────────────────────────────────

describe('Table', () => {
  const cols = [
    { key: 'name', label: 'Name' },
    { key: 'age', label: 'Age', align: 'right' as const },
  ];
  const rows = [
    { name: 'Alice', age: 30 },
    { name: 'Bob', age: 25 },
  ];

  test('creates table with required fields', () => {
    const node = Table({ columns: cols, rows });
    expect(node.type).toBe('table');
    expect(node.columns).toEqual(cols);
    expect(node.rows).toEqual(rows);
  });

  test('includes optional props', () => {
    const node = Table({ columns: cols, rows, striped: true, compact: true, maxRows: 5 });
    expect(node.striped).toBe(true);
    expect(node.compact).toBe(true);
    expect(node.maxRows).toBe(5);
  });

  test('resolves onRowPress', () => {
    _setActionRegistrar(null);
    const node = Table({ columns: cols, rows, onRowPress: () => {} });
    expect(node.onRowPress).toMatch(/^__action_\d+$/);
  });
});

describe('KeyValue', () => {
  const items = [
    { label: 'Host', value: 'localhost' },
    { label: 'Port', value: 8080 },
  ];

  test('creates key-value with required fields', () => {
    const node = KeyValue({ items });
    expect(node.type).toBe('key-value');
    expect(node.items).toEqual(items);
  });

  test('includes optional props', () => {
    const node = KeyValue({ items, layout: 'stacked', dividers: true, compact: true });
    expect(node.layout).toBe('stacked');
    expect(node.dividers).toBe(true);
    expect(node.compact).toBe(true);
  });

  test('items support icon, color, copyable', () => {
    const node = KeyValue({
      items: [{ label: 'IP', value: '127.0.0.1', icon: 'globe', color: '#0f0', copyable: true }],
    });
    const item = node.items[0];
    expect(item?.icon).toBe('globe');
    expect(item?.color).toBe('#0f0');
    expect(item?.copyable).toBe(true);
  });
});

describe('Avatar', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('creates avatar with defaults', () => {
    const node = Avatar({});
    expect(node.type).toBe('avatar');
  });

  test('includes all optional props', () => {
    const node = Avatar({
      src: 'photo.jpg',
      fallback: 'JD',
      alt: 'John Doe',
      size: 'lg',
      shape: 'square',
      status: 'online',
    });
    expect(node.src).toBe('photo.jpg');
    expect(node.fallback).toBe('JD');
    expect(node.alt).toBe('John Doe');
    expect(node.size).toBe('lg');
    expect(node.shape).toBe('square');
    expect(node.status).toBe('online');
  });

  test('resolves onPress', () => {
    const node = Avatar({ onPress: () => {} });
    expect(node.onPress).toMatch(/^__action_\d+$/);
  });

  test('all status values work', () => {
    for (const s of ['online', 'offline', 'busy', 'away'] as const) {
      expect(Avatar({ status: s }).status).toBe(s);
    }
  });
});

describe('Link', () => {
  test('creates link with required fields', () => {
    const node = Link({ label: 'Docs', url: 'https://docs.example.com' });
    expect(node.type).toBe('link');
    expect(node.label).toBe('Docs');
    expect(node.url).toBe('https://docs.example.com');
  });

  test('includes optional props', () => {
    const node = Link({
      label: 'API',
      url: 'https://api.example.com',
      icon: 'external-link',
      variant: 'underline',
      size: 'xs',
    });
    expect(node.icon).toBe('external-link');
    expect(node.variant).toBe('underline');
    expect(node.size).toBe('xs');
  });

  test('all variant values work', () => {
    for (const v of ['default', 'muted', 'underline'] as const) {
      expect(Link({ label: '', url: '', variant: v }).variant).toBe(v);
    }
  });
});

describe('Tabs', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('creates tabs with required fields', () => {
    const node = Tabs({
      value: 'a',
      tabs: [
        { key: 'a', label: 'Tab A' },
        { key: 'b', label: 'Tab B' },
      ],
      onChange: () => {},
    });
    expect(node.type).toBe('tabs');
    expect(node.value).toBe('a');
    expect(node.tabs).toHaveLength(2);
    expect(node.onChange).toMatch(/^__action_\d+$/);
  });

  test('normalizes tab children', () => {
    const child = Text({ content: 'content' });
    const node = Tabs({
      value: 'a',
      tabs: [{ key: 'a', label: 'Tab', children: child }],
      onChange: () => {},
    });
    expect(node.tabs[0]?.children).toEqual([child]);
  });

  test('includes optional variant and icon', () => {
    const node = Tabs({
      value: 'a',
      tabs: [{ key: 'a', label: 'Tab', icon: 'star' }],
      onChange: () => {},
      variant: 'pills',
    });
    expect(node.variant).toBe('pills');
    expect(node.tabs[0]?.icon).toBe('star');
  });
});

describe('CodeBlock', () => {
  test('creates code-block with required fields', () => {
    const node = CodeBlock({ code: 'console.log("hi")' });
    expect(node.type).toBe('code-block');
    expect(node.code).toBe('console.log("hi")');
  });

  test('includes all optional props', () => {
    const node = CodeBlock({
      code: 'fn main() {}',
      language: 'rust',
      showLineNumbers: true,
      maxLines: 20,
      copyable: true,
      label: 'main.rs',
    });
    expect(node.language).toBe('rust');
    expect(node.showLineNumbers).toBe(true);
    expect(node.maxLines).toBe(20);
    expect(node.copyable).toBe(true);
    expect(node.label).toBe('main.rs');
  });
});

describe('Checkbox', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('creates checkbox with required fields', () => {
    const node = Checkbox({ label: 'Accept terms', checked: false, onToggle: () => {} });
    expect(node.type).toBe('checkbox');
    expect(node.label).toBe('Accept terms');
    expect(node.checked).toBe(false);
    expect(node.onToggle).toMatch(/^__action_\d+$/);
  });

  test('includes optional props', () => {
    const node = Checkbox({
      label: 'Enable',
      checked: true,
      onToggle: () => {},
      description: 'Turn it on',
      icon: 'check',
      disabled: true,
    });
    expect(node.description).toBe('Turn it on');
    expect(node.icon).toBe('check');
    expect(node.disabled).toBe(true);
  });
});

describe('Skeleton', () => {
  test('creates skeleton with required variant', () => {
    const node = Skeleton({ variant: 'text' });
    expect(node.type).toBe('skeleton');
    expect(node.variant).toBe('text');
  });

  test('includes optional props', () => {
    const node = Skeleton({ variant: 'rect', width: '100px', height: '50px', lines: 3 });
    expect(node.width).toBe('100px');
    expect(node.height).toBe('50px');
    expect(node.lines).toBe(3);
  });

  test('all variant values work', () => {
    for (const v of ['text', 'circle', 'rect'] as const) {
      expect(Skeleton({ variant: v }).variant).toBe(v);
    }
  });
});

describe('TextInput (multiline)', () => {
  beforeEach(() => {
    _setActionRegistrar(null);
  });

  test('includes multiline and rows', () => {
    const node = TextInput({ value: '', onChange: () => {}, multiline: true, rows: 5 });
    expect(node.multiline).toBe(true);
    expect(node.rows).toBe(5);
  });

  test('multiline defaults are omitted when not set', () => {
    const node = TextInput({ value: '', onChange: () => {} });
    expect(node.multiline).toBeUndefined();
    expect(node.rows).toBeUndefined();
  });
});
