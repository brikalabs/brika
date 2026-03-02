import { describe, expect, mock, test } from 'bun:test';

describe('setBrickData', () => {
  test('delegates to context.setBrickData', async () => {
    const mockSetBrickData = mock();

    mock.module('../context', () => ({
      getContext: () => ({
        setBrickData: mockSetBrickData,
      }),
    }));

    const { setBrickData } = await import('../api/push-brick-data');
    setBrickData('my-brick', { data: 1 });

    expect(mockSetBrickData).toHaveBeenCalledTimes(1);
    expect(mockSetBrickData.mock.calls[0]).toEqual(['my-brick', { data: 1 }]);
  });
});
