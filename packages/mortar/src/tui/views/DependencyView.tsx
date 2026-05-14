/**
 * Full-screen view of the service dependency graph. Renders each
 * topological layer in its own bordered card so the user sees:
 *
 *   - which services run in parallel (same card)
 *   - which services wait on which (the deps list under each row)
 *   - the live status of every node (same glyph as the main view)
 *   - the *port* / *URL* once detected, and the parsed crash reason
 *     for any service that has failed
 *
 * Reached via `d` from main, dismissed via `d` or Esc.
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { serviceUrl, topologicalLayers } from '../../config';
import { useRouter } from '../../router';
import type { ServiceState, ServiceStatus } from '../../supervisor';
import { Card } from '../components/Card';
import { ScreenChrome } from '../components/ScreenChrome';
import type { Routes } from '../routes';
import { useMortar } from '../useMortar';
import { statusColor, statusGlyph, statusLabel, summarizeCrash } from '../utils/status';

export function DependencyView(): React.ReactElement {
  const { services } = useMortar();
  const router = useRouter<Routes>();
  useInput((input, key) => {
    if (key.escape || input === 'd') {
      router.back();
    }
  });
  const stateById = new Map<string, ServiceState>();
  for (const svc of services) {
    stateById.set(svc.spec.id, svc);
  }
  const layers = topologicalLayers(services.map((s) => s.spec));

  return (
    <ScreenChrome title="Dependencies" titleColor="magenta" hint="d or Esc to return">
      <Box marginBottom={1}>
        <Text dimColor>
          {services.length} service{services.length === 1 ? '' : 's'} · {layers.length} layer
          {layers.length === 1 ? '' : 's'} · cards top→bottom = startup order
        </Text>
      </Box>
      <Box flexDirection="column" gap={1}>
        {layers.map((layer, layerIdx) => (
          <Card
            key={`layer-${layerIdx}`}
            title={`Layer ${layerIdx}`}
            accent="cyan"
            tag={layerIdx === 0 ? 'starts first · no deps' : `waits on layer ${layerIdx - 1}`}
          >
            {layer.map((spec) => {
              const state = stateById.get(spec.id);
              if (!state) {
                return null;
              }
              return <DependencyRow key={spec.id} state={state} />;
            })}
          </Card>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Legend </Text>
        <Legend status={{ kind: 'pending' }} label="pending" />
        <Text dimColor> </Text>
        <Legend status={{ kind: 'starting' }} label="starting" />
        <Text dimColor> </Text>
        <Legend status={{ kind: 'healthy' }} label="healthy" />
        <Text dimColor> </Text>
        <Legend status={{ kind: 'crashed', exitCode: null, reason: '' }} label="crashed" />
      </Box>
    </ScreenChrome>
  );
}

function Legend({
  status,
  label,
}: Readonly<{ status: ServiceStatus; label: string }>): React.ReactElement {
  return (
    <Text>
      <Text color={statusColor(status)}>{statusGlyph(status)}</Text>
      <Text dimColor> {label}</Text>
    </Text>
  );
}

function DependencyRow({ state }: Readonly<{ state: ServiceState }>): React.ReactElement {
  const deps = state.spec.dependsOn;
  const url = serviceUrl(state.spec, state.detectedPort);
  const crashDetail = state.status.kind === 'crashed' ? summarizeCrash(state.status).detail : null;
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={statusColor(state.status)}>{statusGlyph(state.status)} </Text>
        <Box width={14}>
          <Text bold>{state.spec.id}</Text>
        </Box>
        <Text>{state.spec.label}</Text>
        <Text dimColor>{` · ${statusLabel(state.status)}`}</Text>
      </Box>
      {url && state.status.kind === 'healthy' && (
        <Box marginLeft={4}>
          <Text dimColor>→ </Text>
          <Text color="cyan">{url}</Text>
        </Box>
      )}
      {crashDetail && (
        <Box marginLeft={4}>
          <Text color="red" dimColor>
            ↳ {crashDetail}
          </Text>
        </Box>
      )}
      {deps.length > 0 && (
        <Box marginLeft={4}>
          <Text dimColor>↳ depends on </Text>
          <Text>{deps.join(', ')}</Text>
        </Box>
      )}
    </Box>
  );
}
