/**
 * Minimal echo plugin for spawnPlugin integration test.
 * Sends a hello message then echoes back any message it receives.
 */

// Send a hello message when started
process.send!({ t: 'hello', plugin: { id: 'echo-test', version: '0.0.1' } });

// Echo back any received IPC message
process.on('message', (msg: { t: string; [key: string]: unknown }) => {
  if (msg.t === 'stop') {
    process.exit(0);
  }
  // Echo with 'echo' type
  process.send!({ t: 'echo', original: msg });
});
