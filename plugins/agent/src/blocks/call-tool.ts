import { defineBlock, input, output, z } from '@brika/sdk';

/**
 * Call Tool: invoke any hub-registered tool by id from inside a workflow.
 *
 * The string input is passed as the tool's named argument (default `prompt`),
 * and the tool's text result is emitted. This is the bridge from the reactive
 * workflow into the global tool layer (`ctx.callTool`): e.g. wire a trigger to
 * `call-tool` with `tool: "ask-claude"` to run Claude on each event.
 */
export const callToolBlock = defineBlock({
  id: 'call-tool',
  meta: {
    name: 'Call Tool',
    description: 'Invoke a hub-registered tool by id and emit its result',
    category: 'action',
    icon: 'wrench',
    color: '#d97757',
  },
  inputs: {
    input: input(z.string(), { name: 'Input' }),
  },
  outputs: {
    result: output(z.string(), { name: 'Result' }),
    error: output(z.object({ message: z.string() }), { name: 'Error' }),
  },
  config: z.object({
    tool: z
      .string()
      .meta({ label: 'Tool', format: 'tool-select' })
      .describe('The registered tool to call'),
    argName: z
      .string()
      .default('prompt')
      .meta({ label: 'Input argument', format: 'tool-arg-select' })
      .describe('Which of the tool arguments the input is passed as'),
  }),
  run: ({ inputs, outputs, config, callTool, log }) => {
    inputs.input.on(async (text) => {
      if (!config.tool) {
        outputs.error.emit({ message: 'No tool selected. Pick a tool in the block config.' });
        return;
      }
      const argName = config.argName || 'prompt';
      try {
        const res = await callTool(config.tool, { [argName]: text });
        if (res.ok) {
          outputs.result.emit(res.content ?? JSON.stringify(res.data ?? null));
        } else {
          const message = res.content ?? `Tool "${config.tool}" failed`;
          log.warn(`Call Tool: ${message}`);
          outputs.error.emit({ message });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Call Tool failed: ${message}`);
        outputs.error.emit({ message });
      }
    });
  },
});
