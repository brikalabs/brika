/**
 * Tests for all node builder functions and _shared utilities.
 *
 * Covers:
 * - _shared.ts: normalizeChildren, resolveAction, _setActionRegistrar
 * - Simple spread factories: Badge, Chart, Divider, Icon, Image, Progress, Spacer, Stat, Status, Text, Video
 * - Container factories: Box, Grid, Section, Stack
 * - Action-resolving factories: Button, Slider, Toggle
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  Badge,
  Box,
  Button,
  Chart,
  Divider,
  Grid,
  Icon,
  Image,
  Progress,
  Section,
  Slider,
  Spacer,
  Stack,
  Stat,
  Status,
  Text,
  Toggle,
  Video,
  normalizeChildren,
  resolveAction,
  _setActionRegistrar,
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
    for (const v of ['default', 'secondary', 'outline', 'success', 'warning', 'destructive'] as const) {
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

describe('Stack', () => {
  test('creates stack node with direction and empty children', () => {
    const node = Stack({ direction: 'vertical' });
    expect(node.type).toBe('stack');
    expect(node.direction).toBe('vertical');
    expect(node.children).toEqual([]);
  });

  test('creates horizontal stack', () => {
    const node = Stack({ direction: 'horizontal' });
    expect(node.direction).toBe('horizontal');
  });

  test('normalizes children', () => {
    const a = Text({ content: 'a' });
    const b = Text({ content: 'b' });
    const node = Stack({ direction: 'vertical', children: [a, b] });
    expect(node.children).toEqual([a, b]);
  });

  test('includes all optional props', () => {
    const node = Stack({
      direction: 'horizontal',
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

  test('filters falsy children', () => {
    const a = Text({ content: 'a' });
    const node = Stack({ direction: 'vertical', children: [a, null, undefined, false] });
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
});
