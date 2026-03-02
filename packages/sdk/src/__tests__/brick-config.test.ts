import { describe, expect, mock, test } from 'bun:test';

describe('onBrickConfigChange', () => {
  test('delegates to context.onBrickConfigChange and returns unsubscribe', async () => {
    const mockUnsub = mock();
    const mockOnBrickConfigChange = mock((_handler: () => void) => mockUnsub);

    // Mock the context module before importing the API module
    mock.module('../context', () => ({
      getContext: () => ({
        onBrickConfigChange: mockOnBrickConfigChange,
      }),
    }));

    const { onBrickConfigChange } = await import('../api/brick-config');
    const handler = () => {
      /* noop */
    };
    const unsub = onBrickConfigChange(handler);

    expect(mockOnBrickConfigChange).toHaveBeenCalledTimes(1);
    expect(mockOnBrickConfigChange.mock.calls[0]).toEqual([handler]);

    unsub();
    expect(mockUnsub).toHaveBeenCalledTimes(1);
  });
});
