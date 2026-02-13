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
 * Note: Block metadata (name, description, icon, color, category)
 * is now stored in package.json, not in the block definition.
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

// ─────────────────────────────────────────────────────────────────────────────
// Define Blocks using Reactive API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Timer Block - uses start(interval(...)) to emit ticks
 */
const timerBlock = defineReactiveBlock(
  {
    id: 'timer',
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
    log('info', `Timer started (${config.interval}ms)`);

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
 * Temperature Sensor Simulator
 */
const tempSensorBlock = defineReactiveBlock(
  {
    id: 'temp-sensor',
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

    start((emit) => {
      const id = setInterval(() => {
        const temp = config.baseTemp + (Math.random() * 2 - 1) * config.variance;
        emit(Math.round(temp * 10) / 10);
      }, config.interval);
      return () => clearInterval(id);
    }).to(outputs.temperature);
  }
);

/**
 * Comfort Calculator - uses combine() with pipe()
 */
const comfortBlock = defineReactiveBlock(
  {
    id: 'comfort-calc',
    inputs: {
      temperature: input(z.number(), { name: 'Temperature' }),
      humidity: input(z.number(), { name: 'Humidity' }),
    },
    outputs: {
      comfort: output(
        z.object({
          score: z.number(),
          label: z.string(),
          temp: z.number(),
          humidity: z.number(),
        }),
        { name: 'Comfort' }
      ),
      alert: output(z.string(), { name: 'Alert' }),
    },
    config: z.object({
      optimalTemp: z.number().default(22),
      optimalHumidity: z.number().default(50),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    log('info', 'Comfort calculator initialized');

    combine(inputs.temperature, inputs.humidity)
      .pipe(
        throttle(1000),
        map(([temp, humidity]) => {
          const tempDiff = Math.abs(temp - config.optimalTemp);
          const humidityDiff = Math.abs(humidity - config.optimalHumidity);
          const score = Math.round(100 - tempDiff * 3 - humidityDiff);
          let label: string;
          if (score > 80) {
            label = 'Excellent';
          } else if (score > 60) {
            label = 'Good';
          } else if (score > 40) {
            label = 'Fair';
          } else {
            label = 'Poor';
          }
          return { score, label, temp, humidity };
        })
      )
      .to(outputs.comfort);

    // Alert output for poor conditions
    combine(inputs.temperature, inputs.humidity).on(([temp, humidity]) => {
      if (temp > 30 || temp < 15) {
        outputs.alert.emit(`⚠️ Temperature alert: ${temp}°C`);
      }
      if (humidity > 80 || humidity < 30) {
        outputs.alert.emit(`⚠️ Humidity alert: ${humidity}%`);
      }
    });
  }
);

/**
 * Logger Block - consumes data and logs it
 */
const loggerBlock = defineReactiveBlock(
  {
    id: 'logger',
    inputs: {
      comfort: input(
        z.object({
          score: z.number(),
          label: z.string(),
          temp: z.number(),
          humidity: z.number(),
        }),
        { name: 'Comfort' }
      ),
      alert: input(z.string(), { name: 'Alert' }),
    },
    outputs: {},
    config: z.object({
      prefix: z.string().default('[ENV]'),
    }),
  },
  ({ inputs, config, log }) => {
    log('info', `Logger initialized with prefix: ${config.prefix}`);

    inputs.comfort.pipe(filter((c) => c.score < 70)).on((c) => {
      log(
        'info',
        `${config.prefix} Comfort: ${c.label} (${c.score}%) | Temp: ${c.temp}°C | Humidity: ${c.humidity}%`
      );
    });

    inputs.alert.on((msg) => {
      log('warn', `${config.prefix} ${msg}`);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Run Demo
// ─────────────────────────────────────────────────────────────────────────────

try {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       BRIKA Reactive Block Demo with Pipe-based API           ║');
  console.log('║                                                               ║');
  console.log('║  Features demonstrated:                                       ║');
  console.log('║  • defineReactiveBlock with Zod schemas                       ║');
  console.log('║  • pipe(op1, op2, ...) for composing operators                ║');
  console.log('║  • start(interval(...)) for source flows                      ║');
  console.log('║  • start(factory) for custom sources                          ║');
  console.log('║  • combine(), map(), filter(), throttle() operators           ║');
  console.log('║  • .to() for routing to outputs                               ║');
  console.log('║  • .on() for side effects                                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  const blocks = [timerBlock, tempSensorBlock, comfortBlock, loggerBlock];

  console.log('📋 Block Definitions:');
  for (const block of blocks) {
    console.log(`   • ${block.id}`);
    console.log(`     Inputs: [${block.inputs.map((p) => p.id).join(', ') || 'none'}]`);
    console.log(`     Outputs: [${block.outputs.map((p) => p.id).join(', ') || 'none'}]`);
  }
  console.log('');

  // Create simple manual test
  console.log('▶️  Starting timer block manually...');
  console.log('');

  const timerInstance = timerBlock.start({
    blockId: 'timer-1',
    workflowId: 'demo',
    config: { interval: 1000 },
    emit: (portId, data) => {
      console.log(`[timer-1:${portId}]`, JSON.stringify(data));
    },
    log: (level, msg) => {
      console.log(`[timer-1] ${level}: ${msg}`);
    },
    callTool: async () => null,
  });

  // Run for 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log('');
  console.log('⏹️  Stopping timer...');
  timerInstance.stop();

  console.log('');
  console.log('✅ Demo completed!');
} catch (err) {
  console.error(err);
}
