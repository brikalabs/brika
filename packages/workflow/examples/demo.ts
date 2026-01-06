/**
 * Demo: Event-Driven Workflow System
 *
 * This example shows how data flows through blocks.
 * Run with: bun packages/workflow/examples/demo.ts
 */

import { z } from 'zod';
import { type BlockRegistry, type CompiledBlock, type Workflow, WorkflowRuntime } from '../src';

// ─────────────────────────────────────────────────────────────────────────────
// Define Blocks (normally done in plugins via @brika/sdk)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Timer Block - emits a tick every N ms
 */
const timerBlock: CompiledBlock = {
  id: 'timer',
  nameKey: 'Timer',
  descriptionKey: 'Emit ticks at interval',
  category: 'sources',
  icon: 'clock',
  color: '#3b82f6',
  inputs: [],
  outputs: [{ id: 'tick', direction: 'output', nameKey: 'Tick', schema: z.number() }],
  configSchema: z.object({
    interval: z.number().default(1000),
  }),
  handlers: {
    onStart(ctx) {
      let count = 0;
      ctx.log('info', `Timer started (${ctx.config.interval}ms interval)`);

      ctx.setInterval(() => {
        count++;
        ctx.log('debug', `Tick #${count}`);
        ctx.emit('tick', count);
      }, ctx.config.interval as number);
    },
    onInput() {
      // No inputs
    },
    onStop(ctx) {
      ctx.log('info', 'Timer stopped');
    },
  },
};

/**
 * Double Block - multiplies input by 2
 */
const doubleBlock: CompiledBlock = {
  id: 'double',
  nameKey: 'Double',
  descriptionKey: 'Multiply by 2',
  category: 'operators',
  icon: 'x',
  color: '#8b5cf6',
  inputs: [{ id: 'in', direction: 'input', nameKey: 'Input', schema: z.number() }],
  outputs: [{ id: 'out', direction: 'output', nameKey: 'Output', schema: z.number() }],
  configSchema: z.object({}),
  handlers: {
    onInput(portId, data, ctx) {
      const value = data as number;
      const result = value * 2;
      ctx.log('debug', `${value} × 2 = ${result}`);
      ctx.emit('out', result);
    },
  },
};

/**
 * Logger Block - logs incoming values
 */
const loggerBlock: CompiledBlock = {
  id: 'logger',
  nameKey: 'Logger',
  descriptionKey: 'Log values',
  category: 'sinks',
  icon: 'terminal',
  color: '#10b981',
  inputs: [{ id: 'value', direction: 'input', nameKey: 'Value', schema: z.unknown() }],
  outputs: [],
  configSchema: z.object({
    prefix: z.string().default('LOG'),
  }),
  handlers: {
    onInput(portId, data, ctx) {
      console.log(`[${ctx.config.prefix}] Received:`, data);
    },
  },
};

/**
 * Filter Block - only pass values > threshold
 */
const filterBlock: CompiledBlock = {
  id: 'filter',
  nameKey: 'Filter',
  descriptionKey: 'Filter by threshold',
  category: 'operators',
  icon: 'filter',
  color: '#f59e0b',
  inputs: [{ id: 'in', direction: 'input', nameKey: 'Input', schema: z.number() }],
  outputs: [
    { id: 'pass', direction: 'output', nameKey: 'Pass', schema: z.number() },
    { id: 'reject', direction: 'output', nameKey: 'Reject', schema: z.number() },
  ],
  configSchema: z.object({
    threshold: z.number().default(5),
  }),
  handlers: {
    onInput(portId, data, ctx) {
      const value = data as number;
      const threshold = ctx.config.threshold as number;

      if (value > threshold) {
        ctx.log('debug', `${value} > ${threshold} → PASS`);
        ctx.emit('pass', value);
      } else {
        ctx.log('debug', `${value} ≤ ${threshold} → REJECT`);
        ctx.emit('reject', value);
      }
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Block Registry
// ─────────────────────────────────────────────────────────────────────────────

const blocks = new Map<string, CompiledBlock>([
  ['demo:timer', { ...timerBlock, type: 'demo:timer' }],
  ['demo:double', { ...doubleBlock, type: 'demo:double' }],
  ['demo:logger', { ...loggerBlock, type: 'demo:logger' }],
  ['demo:filter', { ...filterBlock, type: 'demo:filter' }],
]);

const blockRegistry: BlockRegistry = {
  get(type: string) {
    return blocks.get(type);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Define Workflow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Workflow:
 *
 *   [Timer] ─tick─▶ [Double] ─out─▶ [Filter] ─pass───▶ [Logger: PASS]
 *                                       │
 *                                       └─reject─▶ [Logger: REJECT]
 *
 * Timer emits 1, 2, 3, 4, 5, 6...
 * Double makes them 2, 4, 6, 8, 10, 12...
 * Filter (threshold=5) passes 6, 8, 10, 12... and rejects 2, 4
 */
const workflow: Workflow = {
  version: '1',
  workspace: {
    id: 'demo-workflow',
    name: 'Demo Workflow',
    enabled: true,
  },
  plugins: {},
  blocks: [
    {
      id: 'timer1',
      type: 'demo:timer',
      config: { interval: 500 },
      inputs: {},
      outputs: { tick: ['double1:in'] },
    },
    {
      id: 'double1',
      type: 'demo:double',
      config: {},
      inputs: { in: ['timer1:tick'] },
      outputs: { out: ['filter1:in'] },
    },
    {
      id: 'filter1',
      type: 'demo:filter',
      config: { threshold: 5 },
      inputs: { in: ['double1:out'] },
      outputs: {
        pass: ['logger-pass:value'],
        reject: ['logger-reject:value'],
      },
    },
    {
      id: 'logger-pass',
      type: 'demo:logger',
      config: { prefix: '✅ PASS' },
      inputs: { value: ['filter1:pass'] },
      outputs: {},
    },
    {
      id: 'logger-reject',
      type: 'demo:logger',
      config: { prefix: '❌ REJECT' },
      inputs: { value: ['filter1:reject'] },
      outputs: {},
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Run Demo
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  BRIKA Workflow Demo');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Workflow:');
  console.log('  [Timer] → [Double] → [Filter] → [Logger PASS]');
  console.log('                           └────→ [Logger REJECT]');
  console.log('');
  console.log('Timer: 1, 2, 3...');
  console.log('Double: 2, 4, 6...');
  console.log('Filter (>5): PASS 6, 8, 10... | REJECT 2, 4');
  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');

  // Create runtime
  const runtime = new WorkflowRuntime(workflow, {
    blocks: blockRegistry,
    onLog: (blockId, level, msg) => {
      const levelIcon = { debug: '🔍', info: 'ℹ️', warn: '⚠️', error: '❌' }[level] || '•';
      console.log(`${levelIcon} [${blockId}] ${msg}`);
    },
    onBlockStateChange: (blockId, state) => {
      console.log(`📦 Block "${blockId}" → ${state}`);
    },
  });

  // Observe all events
  runtime.observe((event) => {
    console.log(
      `🔄 Event: ${event.sourceBlockId}:${event.sourcePort} → ${event.targetBlockId}:${event.targetPort} | data=${JSON.stringify(event.data)}`
    );
  });

  // Start workflow
  console.log('🚀 Starting workflow...\n');
  await runtime.start();

  // Run for 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Show port buffers
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log('📊 Port Buffers (last values):');
  for (const buffer of runtime.getAllPortBuffers()) {
    console.log(`   ${buffer.portRef}: ${JSON.stringify(buffer.value)} (count: ${buffer.count})`);
  }

  // Demo: pause and resume
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log('⏸️  Pausing double1 block for 2 seconds...');
  runtime.pauseBlock('double1');
  console.log(`   State: ${runtime.getBlockState('double1')}`);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('▶️  Resuming double1 block (flushing buffered events)...');
  await runtime.resumeBlock('double1');

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Demo: retrigger
  console.log('\n───────────────────────────────────────────────────────────────');
  console.log('🔁 Retriggering last value from filter1:pass...');
  await runtime.retrigger('filter1', 'pass');

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Stop workflow
  console.log('\n🛑 Stopping workflow...');
  await runtime.stop();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Demo Complete!');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
