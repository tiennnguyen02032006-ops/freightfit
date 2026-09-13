import { describe, expect, it } from 'vitest';
import { determineUnfitReason } from '../../../src/engine/packing/unfitReason';

describe('determineUnfitReason', () => {
  it('OVERWEIGHT được ưu tiên cao nhất khi vượt payload', () => {
    const reason = determineUnfitReason({
      exceedsPayloadAlone: true,
      noOrientationFitsContainerBounds: true,
      allFailuresWereStacking: true,
    });
    expect(reason).toBe('OVERWEIGHT');
  });

  it('ROTATION_CONFLICT khi không có orientation nào fit container bounds (và không overweight)', () => {
    const reason = determineUnfitReason({
      exceedsPayloadAlone: false,
      noOrientationFitsContainerBounds: true,
      allFailuresWereStacking: true,
    });
    expect(reason).toBe('ROTATION_CONFLICT');
  });

  it('STACK_CONFLICT khi mọi candidate hợp lệ hình học đều fail vì stacking', () => {
    const reason = determineUnfitReason({
      exceedsPayloadAlone: false,
      noOrientationFitsContainerBounds: false,
      allFailuresWereStacking: true,
    });
    expect(reason).toBe('STACK_CONFLICT');
  });

  it('NO_SPACE khi không rơi vào các trường hợp trên', () => {
    const reason = determineUnfitReason({
      exceedsPayloadAlone: false,
      noOrientationFitsContainerBounds: false,
      allFailuresWereStacking: false,
    });
    expect(reason).toBe('NO_SPACE');
  });
});
