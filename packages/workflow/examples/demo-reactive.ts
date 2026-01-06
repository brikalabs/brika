/**
 * Demo: Reactive Block System with Pipe-based API
 *
 * Uses defineReactiveBlock from @brika/sdk with Zod-typed ports.
 * Demonstrates:
 *   - pipe(op1, op2, ...) for composing operators
 *   - .to() for routing flows to outputs
 *   - .on() for conditional logic
 *   - start(interval(...)) for creating source flows
 *   - combine(), map(), filter(), throttle() operators
 *
 * Run with: bun packages/workflow/examples/demo-reactive.ts
 */

import {
  combine,
  defineReactiveBlock,
  filter,
  input,
  interval,
  map,
  output,
  throttle,
  z,
} from '../../sdk/src';
import { type BlockRegistry, type CompiledBlock, type Workflow, WorkflowRuntime } from '../src';

// ─────────────────────────────────────────────────────────────────────────────
// Define Blocks using Reactive API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Timer Block - uses start(interval(...)) to emit ticks
 */
const timerBlock = defineReactiveBlock(
  {
    id: 'timer',
    name: 'Timer',
    description: 'Emit ticks at interval using start(interval(...))',
    category: 'sources',
    icon: 'clock',
    color: '#3b82f6',
    inputs: {},
    outputs: {
      tick: output(
        z.object({
          count: z.number(),
          timestamp: z.number(),
        }),
        { name: 'Tick' }
      ),
    },
    config: z.object({
      interval: z.number().default(1000),
    }),
  },
  ({ outputs, config, start, log }) => {
    log('info', `Timer started (${config.interval}ms) using start(interval(...))`);

    // Use start(interval(...)) to create a source flow
    // The interval emits 0, 1, 2, 3, ...
    // Use pipe() with map() operator
    start(interval(config.interval))
      .pipe(
        map((count) => ({
          count,
          timestamp: Date.now(),
        }))
      )
      .to(outputs.tick);
  }
);

/**
 * Temperature Sensor Simulator - uses start(factory) for custom source
 */
const tempSensorBlock = defineReactiveBlock(
  {
    id: 'temp-sensor',
    name: 'Temperature Sensor',
    description: 'Simulates temperature readings using start(factory)',
    category: 'sources',
    icon: 'thermometer',
    color: '#ef4444',
    inputs: {},
    outputs: {
      temperature: output(z.number(), { name: 'Temperature °C' }),
    },
    config: z.object({
      interval: z.number().default(2000),
      baseTemp: z.number().default(22),
      variance: z.number().default(5),
    }),
  },
  ({ outputs, config, start, log }) => {
    log('info', `Temp sensor started (base: ${config.baseTemp}°C)`);

    // Use start(factory) for custom source logic
    start((emit) => {
      const id = setInterval(() => {
        const temp = config.baseTemp + (Math.random() - 0.5) * config.variance * 2;
        const rounded = Math.round(temp * 10) / 10;
        emit(rounded);
      }, config.interval);
      return () => clearInterval(id);
    }).to(outputs.temperature);
  }
);

/**
 * Humidity Sensor Simulator
 */
const humiditySensorBlock = defineReactiveBlock(
  {
    id: 'humidity-sensor',
    name: 'Humidity Sensor',
    description: 'Simulates humidity readings',
    category: 'sources',
    icon: 'droplets',
    color: '#3b82f6',
    inputs: {},
    outputs: {
      humidity: output(z.number(), { name: 'Humidity %' }),
    },
    config: z.object({
      interval: z.number().default(2500),
      baseHumidity: z.number().default(50),
      variance: z.number().default(10),
    }),
  },
  ({ outputs, config, start, log }) => {
    log('info', `Humidity sensor started (base: ${config.baseHumidity}%)`);

    // Use start(interval(...)) and pipe(map()) to generate values
    start(interval(config.interval))
      .pipe(
        map(() => {
          const humidity = config.baseHumidity + (Math.random() - 0.5) * config.variance * 2;
          return Math.round(humidity);
        })
      )
      .to(outputs.humidity);
  }
);

/**
 * Comfort Index Calculator - uses pipe() with operators
 */
const comfortBlock = defineReactiveBlock(
  {
    id: 'comfort',
    name: 'Comfort Index',
    description: 'Calculate comfort from temp + humidity',
    category: 'operators',
    icon: 'smile',
    color: '#10b981',
    inputs: {
      temperature: input(z.number(), { name: 'Temperature °C' }),
      humidity: input(z.number(), { name: 'Humidity %' }),
    },
    outputs: {
      comfort: output(
        z.object({
          score: z.number(),
          label: z.string(),
          temp: z.number(),
          humidity: z.number(),
        }),
        { name: 'Comfort Index' }
      ),
      alert: output(z.string(), { name: 'Alert' }),
    },
    config: z.object({
      idealTemp: z.number().default(22),
      idealHumidity: z.number().default(50),
      alertThreshold: z.number().default(60),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    log(
      'info',
      `Comfort calculator ready (ideal: ${config.idealTemp}°C, ${config.idealHumidity}%)`
    );

    // Combine latest values from both sensors using pipe()
    combine(inputs.temperature, inputs.humidity)
      .pipe(
        map(([temp, humidity]) => {
          const tempScore = 100 - Math.abs(temp - config.idealTemp) * 5;
          const humidityScore = 100 - Math.abs(humidity - config.idealHumidity) * 2;
          const score = Math.round((tempScore + humidityScore) / 2);
          const label =
            score > 80 ? 'Excellent' : score > 60 ? 'Good' : score > 40 ? 'Fair' : 'Poor';
          return { score, label, temp, humidity };
        }),
        throttle(500)
      )
      .to(outputs.comfort);

    // Alert on high temperature using pipe(filter()) and .on()
    inputs.temperature.pipe(filter((t) => t > config.idealTemp + 5)).on((t) => {
      outputs.alert.emit(`⚠️ High temperature: ${t}°C`);
    });

    // Alert on low temperature
    inputs.temperature.pipe(filter((t) => t < config.idealTemp - 5)).on((t) => {
      outputs.alert.emit(`⚠️ Low temperature: ${t}°C`);
    });
  }
);

/**
 * Display Block - uses .on() to react to data
 */
const displayBlock = defineReactiveBlock(
  {
    id: 'display',
    name: 'Display',
    description: 'Display comfort data',
    category: 'sinks',
    icon: 'monitor',
    color: '#8b5cf6',
    inputs: {
      comfort: input(
        z.object({
          score: z.number(),
          label: z.string(),
          temp: z.number(),
          humidity: z.number(),
        }),
        { name: 'Comfort Data' }
      ),
      alert: input(z.string(), { name: 'Alert' }),
    },
    outputs: {},
    config: z.object({}),
  },
  ({ inputs }) => {
    // React to comfort updates using .on()
    inputs.comfort.on((data) => {
      const bar =
        '█'.repeat(Math.floor(data.score / 10)) + '░'.repeat(10 - Math.floor(data.score / 10));
      console.log(`\n📊 Comfort: [${bar}] ${data.score}% (${data.label})`);
      console.log(`   🌡️  Temp: ${data.temp}°C | 💧 Humidity: ${data.humidity}%`);
    });

    // React to alerts
    inputs.alert.on((msg) => {
      console.log(`\n🚨 ALERT: ${msg}`);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Convert to CompiledBlock format for runtime
// ─────────────────────────────────────────────────────────────────────────────

function toRuntimeBlock(
  block: ReturnType<typeof defineReactiveBlock>,
  typePrefix: string
): CompiledBlock {
  const type = `${typePrefix}:${block.id}`;
  return {
    ...block,
    type,
    nameKey: block.name,
    descriptionKey: block.description,
    configSchema: z.object({}),
    inputs: block.inputs.map((p) => ({
      ...p,
      schema: z.unknown(),
    })),
    outputs: block.outputs.map((p) => ({
      ...p,
      schema: z.unknown(),
    })),
  } as unknown as CompiledBlock;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Registry
// ─────────────────────────────────────────────────────────────────────────────

const blocks = new Map<string, CompiledBlock>([
  ['demo:timer', toRuntimeBlock(timerBlock, 'demo')],
  ['demo:temp-sensor', toRuntimeBlock(tempSensorBlock, 'demo')],
  ['demo:humidity-sensor', toRuntimeBlock(humiditySensorBlock, 'demo')],
  ['demo:comfort', toRuntimeBlock(comfortBlock, 'demo')],
  ['demo:display', toRuntimeBlock(displayBlock, 'demo')],
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
 *   [Temp Sensor] ─temperature─┐
 *                              ├─▶ [Comfort] ─comfort─▶ [Display]
 *   [Humidity Sensor] ─humidity┘        │
 *                                       └─alert───▶ [Display]
 */
const workflow: Workflow = {
  version: '1',
  workspace: {
    id: 'comfort-demo',
    name: 'Comfort Index Demo',
    enabled: true,
  },
  plugins: {},
  blocks: [
    {
      id: 'temp',
      type: 'demo:temp-sensor',
      config: { interval: 1500, baseTemp: 22, variance: 8 },
      inputs: {},
      outputs: { temperature: ['comfort:temperature'] },
    },
    {
      id: 'humidity',
      type: 'demo:humidity-sensor',
      config: { interval: 2000, baseHumidity: 50, variance: 15 },
      inputs: {},
      outputs: { humidity: ['comfort:humidity'] },
    },
    {
      id: 'comfort',
      type: 'demo:comfort',
      config: { idealTemp: 22, idealHumidity: 50, alertThreshold: 60 },
      inputs: {
        temperature: ['temp:temperature'],
        humidity: ['humidity:humidity'],
      },
      outputs: {
        comfort: ['display:comfort'],
        alert: ['display:alert'],
      },
    },
    {
      id: 'display',
      type: 'demo:display',
      config: {},
      inputs: {
        comfort: ['comfort:comfort'],
        alert: ['comfort:alert'],
      },
      outputs: {},
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Run Demo
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  BRIKA Reactive Workflow Demo (Pipe-based API)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Workflow:');
  console.log('  [Temp Sensor] ───┐');
  console.log('                   ├──▶ [Comfort] ──▶ [Display]');
  console.log('  [Humidity Sensor]┘');
  console.log('');
  console.log('Pipe-based API:');
  console.log('  • flow.pipe(map(...), filter(...), throttle(...))');
  console.log('  • start(interval(ms)).pipe(map(...)).to(output)');
  console.log('  • start(factory).to(output)');
  console.log('  • flow.to(output) - route to output');
  console.log('  • flow.on(callback) - side effects');
  console.log('  • combine(), merge(), zip() - combinators');
  console.log('  • Auto cleanup on block stop');
  console.log('');
  console.log('───────────────────────────────────────────────────────────────');

  const runtime = new WorkflowRuntime(workflow, {
    blocks: blockRegistry,
    onLog: (blockId, level, msg) => {
      if (level !== 'debug') {
        console.log(`[${blockId}] ${msg}`);
      }
    },
  });

  console.log('\n🚀 Starting workflow...\n');
  await runtime.start();

  // Run for 10 seconds
  await new Promise((resolve) => setTimeout(resolve, 10000));

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log('📊 Final Port Buffers:');
  for (const buffer of runtime.getAllPortBuffers()) {
    console.log(`   ${buffer.portRef}: ${buffer.count} events`);
  }

  console.log('\n🛑 Stopping workflow...');
  await runtime.stop();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Demo Complete!');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
