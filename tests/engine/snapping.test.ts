import { describe, expect, it } from 'vitest';
import {
  computeAxisSnap,
  computeSnapThreshold,
  snapCandidatePosition,
  snapVerticalPosition,
  type SnapBox3D,
} from '../../src/engine/snapping';
import { SNAP_THRESHOLD_MIN_MM, SNAP_THRESHOLD_RATIO } from '../../src/engine/config';

describe('computeSnapThreshold', () => {
  it('kiện đủ lớn -> ngưỡng = 5% kích thước (tỉ lệ % làm chủ)', () => {
    expect(computeSnapThreshold(2000)).toBe(2000 * SNAP_THRESHOLD_RATIO); // 100mm
  });

  it('kiện rất nhỏ -> ngưỡng không tụt dưới mức tối thiểu 3cm', () => {
    // 5% của 200mm = 10mm < 30mm tối thiểu -> phải lấy 30mm.
    expect(computeSnapThreshold(200)).toBe(SNAP_THRESHOLD_MIN_MM);
  });
});

describe('computeAxisSnap', () => {
  const threshold = 50; // ngưỡng cố định 50mm để test dễ kiểm chứng bằng tay

  it('mặt MIN nằm trong ngưỡng của 1 target -> snap khít vào đúng target (khoảng cách = 0)', () => {
    // Kiện kéo tới x=980..1180 (size 200), target gần nhất là 1000 (cách 20mm < 50mm ngưỡng).
    const result = computeAxisSnap(980, 200, [1000], threshold);
    expect(result.snapped).toBe(true);
    expect(result.value).toBe(1000);
    expect(result.snappedFace).toBe('MIN');
    expect(result.snappedTargetValue).toBe(1000);
  });

  it('mặt MAX nằm trong ngưỡng của 1 target -> snap khít mặt MAX, mặt MIN dịch theo cùng lượng', () => {
    // size=200, candidateMin=800 -> candidateMax=1000; target=1010 cách MAX 10mm < 50mm.
    const result = computeAxisSnap(800, 200, [1010], threshold);
    expect(result.snapped).toBe(true);
    expect(result.snappedFace).toBe('MAX');
    expect(result.value).toBe(810); // MIN dịch +10 để MAX (1000->1010) khớp đúng target
    expect(result.snappedTargetValue).toBe(1010);
  });

  it('khoảng cách đúng bằng ngưỡng (biên) -> vẫn coi là snap (<=, không phải <)', () => {
    const result = computeAxisSnap(950, 200, [1000], threshold); // cách đúng 50mm
    expect(result.snapped).toBe(true);
    expect(result.value).toBe(1000);
  });

  it('khoảng cách vượt ngưỡng dù chỉ 1 chút -> KHÔNG snap, giữ nguyên vị trí kéo', () => {
    const result = computeAxisSnap(949, 200, [1000], threshold); // cách 51mm > 50mm
    expect(result.snapped).toBe(false);
    expect(result.value).toBe(949);
  });

  it('nhiều target cùng trong ngưỡng -> chọn target GẦN NHẤT, không phải target đầu tiên', () => {
    // candidateMin=1000, size=100 -> MIN=1000. target xa hơn (970, cách 30) liệt kê TRƯỚC target
    // gần hơn (995, cách 5) — phải chọn target gần hơn (995) bất kể thứ tự trong mảng.
    const result = computeAxisSnap(1000, 100, [970, 995], threshold);
    expect(result.snapped).toBe(true);
    expect(result.value).toBe(995);
    expect(result.snappedTargetValue).toBe(995);
  });

  it('không có target nào trong ngưỡng -> không snap', () => {
    const result = computeAxisSnap(0, 200, [5000], threshold);
    expect(result.snapped).toBe(false);
    expect(result.value).toBe(0);
  });
});

describe('snapCandidatePosition', () => {
  it('snap độc lập theo từng trục — X khớp vào tường container, Y không đủ gần bất kỳ mặt nào', () => {
    const result = snapCandidatePosition({
      candidate: { x: 15, y: 500, length: 400, width: 300 }, // ngưỡng X = max(20,30)=30mm -> 15mm cách tường (0) hợp lệ
      containerInnerLength: 2000,
      containerInnerWidth: 1000,
      otherPlacements: [],
    });
    expect(result.snappedX).toBe(true);
    expect(result.x).toBe(0); // khít vào vách container tại x=0
    expect(result.snappedY).toBe(false);
    expect(result.y).toBe(500); // giữ nguyên, không có target nào đủ gần
  });

  it('snap vào mặt kiện khác đã xếp gần đó (không chỉ vách container)', () => {
    const neighbor = { x: 1000, y: 0, length: 400, width: 300 };
    // Kéo kiện mới tới sát cạnh phải của neighbor (neighbor kết thúc tại x=1400), cách 10mm.
    const result = snapCandidatePosition({
      candidate: { x: 1410, y: 0, length: 200, width: 200 },
      containerInnerLength: 2000,
      containerInnerWidth: 1000,
      otherPlacements: [neighbor],
    });
    expect(result.snappedX).toBe(true);
    expect(result.x).toBe(1400); // áp khít vào đúng mặt phải của neighbor, không còn khe hở
  });

  it('cả 2 trục đều snap độc lập cùng lúc khi đều đủ gần', () => {
    // y=695, width=300 -> mặt MAX ở 995, cách vách innerWidth=1000 đúng 5mm (trong ngưỡng 30mm).
    const result = snapCandidatePosition({
      candidate: { x: 10, y: 695, length: 400, width: 300 },
      containerInnerLength: 2000,
      containerInnerWidth: 1000,
      otherPlacements: [],
    });
    expect(result.snappedX).toBe(true);
    expect(result.x).toBe(0);
    expect(result.snappedY).toBe(true);
    expect(result.y).toBe(700); // khít vào vách innerWidth=1000 -> y = 1000 - width(300) = 700
  });
});

describe('snapVerticalPosition', () => {
  const box: SnapBox3D = { x: 0, y: 0, z: 0, length: 400, width: 300, height: 200 };

  it('gần sát sàn (trong ngưỡng) -> hút khít z=0, không chỉ dừng ở vị trí kéo', () => {
    // threshold = max(0.05*200,30) = 30mm. Kéo tới z=15 (cách sàn 15mm < 30mm).
    const result = snapVerticalPosition({
      candidate: { ...box, z: 15 },
      containerInnerHeight: 2400,
      otherPlacements: [],
    });
    expect(result.snapped).toBe(true);
    expect(result.z).toBe(0);
    expect(result.snapTargetValue).toBe(0);
  });

  it('kéo XUYÊN SÀN (z âm) -> bị chặn cứng, kẹp về đúng z=0 (không xuống thấp hơn)', () => {
    const result = snapVerticalPosition({
      candidate: { ...box, z: -80 },
      containerInnerHeight: 2400,
      otherPlacements: [],
    });
    expect(result.z).toBe(0);
  });

  it('xa sàn và xa mọi mặt khác -> không snap, giữ đúng vị trí kéo', () => {
    // z=500, cách sàn 500mm >> 30mm ngưỡng, không có kiện nào khác, trần container còn xa.
    const result = snapVerticalPosition({
      candidate: { ...box, z: 500 },
      containerInnerHeight: 2400,
      otherPlacements: [],
    });
    expect(result.snapped).toBe(false);
    expect(result.z).toBe(500);
  });

  it('gần sát nóc kiện hàng bên dưới (footprint chồng lên nhau) -> hút khít lên đúng mặt nóc đó', () => {
    // Kiện dưới cao 300mm (đỉnh ở z=300), footprint trùng hoàn toàn với kiện đang kéo.
    const below: SnapBox3D = { x: 0, y: 0, z: 0, length: 400, width: 300, height: 300 };
    const result = snapVerticalPosition({
      candidate: { ...box, z: 320 }, // cách đỉnh kiện dưới (300) 20mm < 30mm ngưỡng
      containerInnerHeight: 2400,
      otherPlacements: [below],
    });
    expect(result.snapped).toBe(true);
    expect(result.z).toBe(300);
    expect(result.snapTargetValue).toBe(300);
  });

  it('kéo XUYÊN QUA kiện hàng bên dưới -> bị chặn cứng ngay tại đúng mặt nóc kiện đó', () => {
    const below: SnapBox3D = { x: 0, y: 0, z: 0, length: 400, width: 300, height: 300 };
    // Cố kéo xuống z=100 (xuyên vào giữa kiện dưới, vì kiện dưới cao tới z=300) -> phải bị đẩy
    // ngược lên đúng z=300 (mặt nóc kiện dưới), không được lọt vào trong.
    const result = snapVerticalPosition({
      candidate: { ...box, z: 100 },
      containerInnerHeight: 2400,
      otherPlacements: [below],
    });
    expect(result.z).toBe(300);
  });

  it('footprint KHÔNG chồng lên nhau -> kiện bên cạnh không ảnh hưởng, sàn vẫn là z=0', () => {
    // Kiện khác ở xa (x=2000..2400), footprint không chồng lên kiện đang kéo (x=0..400).
    const faraway: SnapBox3D = { x: 2000, y: 0, z: 0, length: 400, width: 300, height: 300 };
    const result = snapVerticalPosition({
      candidate: { ...box, z: 5 },
      containerInnerHeight: 2400,
      otherPlacements: [faraway],
    });
    expect(result.snapped).toBe(true);
    expect(result.z).toBe(0); // vẫn hút vào sàn, không bị kiện xa ảnh hưởng
  });

  it('gần sát trần container -> hút khít đỉnh kiện chạm trần', () => {
    // containerInnerHeight=2400, height=200 -> ceilingZ lý tưởng = 2200. Kéo tới z=2185 (đỉnh ở
    // 2385, cách trần thật 2400 đúng 15mm < 30mm ngưỡng).
    const result = snapVerticalPosition({
      candidate: { ...box, z: 2185 },
      containerInnerHeight: 2400,
      otherPlacements: [],
    });
    expect(result.snapped).toBe(true);
    expect(result.z).toBe(2200);
    expect(result.snapTargetValue).toBe(2400);
  });

  it('bị kiện khác chặn phía trên (footprint chồng) -> không kéo xuyên lên được, kẹp dưới mặt đáy kiện đó', () => {
    const above: SnapBox3D = { x: 0, y: 0, z: 500, length: 400, width: 300, height: 200 };
    // Cố kéo lên z=450 (đỉnh ở 450+200=650, vượt qua đáy kiện trên tại z=500) -> phải bị chặn lại
    // ở đúng z=300 (500 - height 200) để đỉnh vừa chạm đáy kiện trên, không xuyên qua.
    const result = snapVerticalPosition({
      candidate: { ...box, z: 450 },
      containerInnerHeight: 2400,
      otherPlacements: [above],
    });
    expect(result.z).toBe(300);
  });
});
