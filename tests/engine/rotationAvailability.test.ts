import { describe, expect, it } from 'vitest';
import { getAvailableRotationAxes } from '../../src/engine/rotationAvailability';

describe('getAvailableRotationAxes', () => {
  it("rotation 'NONE' (chỉ 1 orientation) -> cả 3 trục đều không xoay được", () => {
    const result = getAvailableRotationAxes(
      { length: 400, width: 300, height: 200 },
      [[400, 300, 200]],
    );
    expect(result).toEqual({ canRotateX: false, canRotateY: false, canRotateZ: false });
  });

  it("rotation 'YAW' hoặc 'Giữ đứng' (2 orientation, chỉ đổi dài/rộng) -> chỉ trục Y xoay được, X/Z bị khóa", () => {
    const result = getAvailableRotationAxes(
      { length: 400, width: 300, height: 200 },
      [
        [400, 300, 200],
        [300, 400, 200],
      ],
    );
    expect(result).toEqual({ canRotateX: false, canRotateY: true, canRotateZ: false });
  });

  it("rotation 'FULL' (6 hoán vị đầy đủ) -> cả 3 trục đều xoay được", () => {
    const result = getAvailableRotationAxes(
      { length: 400, width: 300, height: 200 },
      [
        [400, 300, 200],
        [300, 400, 200],
        [400, 200, 300],
        [200, 400, 300],
        [300, 200, 400],
        [200, 300, 400],
      ],
    );
    expect(result).toEqual({ canRotateX: true, canRotateY: true, canRotateZ: true });
  });
});
