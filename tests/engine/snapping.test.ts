import { describe, expect, it } from 'vitest';
import {
  computeAxisSnap,
  computeFloorZ,
  computeSnapThreshold,
  snapCandidatePosition,
  snapVerticalPosition,
  type SnapBox3D,
} from '../../src/engine/snapping';
import { MIN_SUPPORT_RATIO, SNAP_THRESHOLD_MIN_MM, SNAP_THRESHOLD_RATIO } from '../../src/engine/config';
import { computeSupportRatio, findSupportingPlacements, meetsMinSupportRatio } from '../../src/engine/constraints/support';
import { makePlacement } from '../fixtures/placement';

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

  it('snap khít lên nóc 1 kiện dưới dù footprint chỉ chồng lấn RẤT ÍT (< ngưỡng support hợp lệ) — CHỨNG MINH snapVerticalPosition KHÔNG tự kiểm tra support ratio, chỉ xét khoảng cách hình học (xem DraggablePlacement.tsx: đây là lý do KHÔNG được dùng .snapped làm tín hiệu "hợp lệ" mà không revalidate riêng)', () => {
    // Kiện dưới chỉ chồng lấn 40x300 trên tổng 400x300 chân đế kiện đang kéo (~10% diện tích, thấp
    // hơn hẳn MIN_SUPPORT_RATIO 0.75) — nhưng vẫn nằm trong ngưỡng snap hình học (đỉnh cách 20mm).
    const belowTinyOverlap: SnapBox3D = { x: 360, y: 0, z: 0, length: 400, width: 300, height: 300 };
    const result = snapVerticalPosition({
      candidate: { ...box, z: 320 }, // box.x=0..400, below.x=360..760 -> chồng lấn x chỉ 360..400 (40mm)
      containerInnerHeight: 2400,
      otherPlacements: [belowTinyOverlap],
    });
    // snapVerticalPosition VẪN báo snapped=true, hút khít z=300 — dù support ratio thực tế (nếu
    // tính bằng computeSupportRatio) chỉ ~10%, dưới xa ngưỡng hợp lệ. Đây chính là gốc rễ bug: nếu
    // UI coi "snapped" là tín hiệu "vị trí hợp lệ" mà không revalidate riêng qua
    // revalidatePlacement (như đã sửa ở DraggablePlacement.tsx — SnapFaceHighlight giờ chỉ hiện khi
    // dragValidity === 'valid'), người dùng sẽ thấy "tô xanh" ở 1 vị trí thực ra sẽ bị từ chối vì
    // LOW_SUPPORT khi commit.
    expect(result.snapped).toBe(true);
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

  it('trả về đúng floorSupportPlacement khi z khớp vào floorZ do 1 kiện cụ thể tạo ra', () => {
    const below: SnapBox3D = { x: 0, y: 0, z: 0, length: 400, width: 300, height: 300 };
    const result = snapVerticalPosition({
      candidate: { ...box, z: 320 }, // cách đỉnh kiện dưới (300) 20mm < 30mm ngưỡng
      containerInnerHeight: 2400,
      otherPlacements: [below],
    });
    expect(result.snapped).toBe(true);
    expect(result.z).toBe(300);
    expect(result.floorSupportPlacement).toBe(below);
  });

  it('KHÔNG trả floorSupportPlacement khi z khớp vào SÀN CONTAINER (floorZ=0) — sàn không phải 1 kiện cụ thể', () => {
    const result = snapVerticalPosition({
      candidate: { ...box, z: 15 },
      containerInnerHeight: 2400,
      otherPlacements: [],
    });
    expect(result.snapped).toBe(true);
    expect(result.z).toBe(0);
    expect(result.floorSupportPlacement).toBeUndefined();
  });

  it('trong nhiều kiện đỡ chồng chéo, floorSupportPlacement là đúng kiện tạo ra floorZ CAO NHẤT (kiện thật sự được đứng lên)', () => {
    const lowerBelow: SnapBox3D = { x: 0, y: 0, z: 0, length: 400, width: 300, height: 150 };
    const higherBelow: SnapBox3D = { x: 0, y: 0, z: 0, length: 400, width: 300, height: 300 };
    const result = snapVerticalPosition({
      candidate: { ...box, z: 305 },
      containerInnerHeight: 2400,
      otherPlacements: [lowerBelow, higherBelow],
    });
    expect(result.z).toBe(300);
    expect(result.floorSupportPlacement).toBe(higherBelow);
  });
});

describe('phối hợp snap ngang + dọc khi hạ xuống 1 mặt đỡ cụ thể (bug đã sửa)', () => {
  // Mô phỏng ĐÚNG cách DraggablePlacement.tsx phối hợp 2 hàm sau khi sửa: dò snap dọc bằng vị trí
  // ngang RAW để lấy floorSupportPlacement, rồi snap ngang CHỈ nhắm kiện đó (thay vì mọi kiện khác)
  // trước khi chốt lại snap dọc lần cuối — so sánh với cách CŨ (snap ngang luôn nhắm TOÀN BỘ
  // otherPlacements, không biết gì về kiện đang chuẩn bị đỡ) để chứng minh khác biệt thật sự.
  const support = makePlacement({ id: 'support', x: 0, y: 0, z: 0, length: 300, width: 300, height: 200 });
  // 2 kiện "decoy" hoàn toàn KHÔNG LIÊN QUAN tới việc hạ xuống (z rất cao, không chồng chéo tầng
  // đang kéo tới) nhưng vô tình có MÉP gần vị trí con trỏ hơn cả support — đúng kịch bản khiến snap
  // ngang KIỂU CŨ (không biết ưu tiên support) bị "hút" nhầm sang chúng.
  const decoyX = makePlacement({ id: 'decoy-x', x: 45, y: 0, z: 600, length: 300, width: 300, height: 200 });
  const decoyY = makePlacement({ id: 'decoy-y', x: 0, y: 45, z: 600, length: 300, width: 300, height: 200 });

  const dragged = { length: 300, width: 300, height: 200 };
  const containerInnerLength = 2000;
  const containerInnerWidth = 1000;
  const containerInnerHeight = 1000;

  // Con trỏ đang kéo kiện hàng tới gần (x=25,y=25,z=175) — đủ gần cả support LẪN 2 decoy để tất cả
  // đều là ứng viên snap hợp lệ trong ngưỡng (threshold 300mm-item = 30mm).
  const raw = { x: 25, y: 25, z: 175 };

  it('CÁCH CŨ (snap ngang nhắm TOÀN BỘ otherPlacements, không ưu tiên support) -> chân đế lệch sang decoy, support ratio KHÔNG đạt ngưỡng', () => {
    const allPlacements = [support, decoyX, decoyY];

    const horizontalOld = snapCandidatePosition({
      candidate: { x: raw.x, y: raw.y, length: dragged.length, width: dragged.width },
      containerInnerLength,
      containerInnerWidth,
      otherPlacements: allPlacements,
    });
    // Snap ngang bị decoy "hút" (mép decoy gần con trỏ hơn mép support) -> lệch khỏi (0,0).
    expect(horizontalOld.x).toBe(45);
    expect(horizontalOld.y).toBe(45);

    // z = support.height (200) — ĐANG ĐỨNG TRÊN NÓC support, không phải sàn container (z=0 sẽ luôn
    // trả support ratio 1.0 bất kể chân đế, xem computeSupportRatio — không phải kịch bản đang test).
    const finalBox = { x: horizontalOld.x, y: horizontalOld.y, z: support.height, ...dragged };
    const supportingPlacements = findSupportingPlacements(finalBox, [support]);
    const supportRatio = computeSupportRatio(finalBox, supportingPlacements);

    expect(supportRatio).toBeCloseTo(0.7225, 3);
    expect(meetsMinSupportRatio(supportRatio, MIN_SUPPORT_RATIO)).toBe(false); // < 0.75 -> KHÔNG đạt
  });

  it('CÁCH MỚI (dò floorSupportPlacement trước, snap ngang chỉ nhắm ĐÚNG support đó) -> chân đế chồng khít hoàn toàn, support ratio đạt tối đa', () => {
    const allPlacements = [support, decoyX, decoyY];

    // Bước 1: dò snap dọc bằng vị trí ngang RAW để lấy floorSupportPlacement.
    const verticalProbe = snapVerticalPosition({
      candidate: { x: raw.x, y: raw.y, z: raw.z, ...dragged },
      containerInnerHeight,
      otherPlacements: allPlacements,
    });
    expect(verticalProbe.floorSupportPlacement).toBe(support);

    // Bước 2: snap ngang CHỈ nhắm đúng support vừa dò được (đúng thay đổi ở DraggablePlacement.tsx).
    const horizontalNew = snapCandidatePosition({
      candidate: { x: raw.x, y: raw.y, length: dragged.length, width: dragged.width },
      containerInnerLength,
      containerInnerWidth,
      otherPlacements: [support],
    });
    expect(horizontalNew.x).toBe(0);
    expect(horizontalNew.y).toBe(0);

    const finalBox = { x: horizontalNew.x, y: horizontalNew.y, z: support.height, ...dragged };
    const supportingPlacements = findSupportingPlacements(finalBox, [support]);
    const supportRatio = computeSupportRatio(finalBox, supportingPlacements);

    expect(supportRatio).toBe(1); // chồng khít hoàn toàn lên support
    expect(meetsMinSupportRatio(supportRatio, MIN_SUPPORT_RATIO)).toBe(true);
  });
});

describe('computeFloorZ — kiểu "trọng lực" (gravity-drop) dùng bởi DraggablePlacement.tsx', () => {
  const supportA: SnapBox3D = { x: 0, y: 0, z: 0, length: 400, width: 300, height: 200 };
  const dragged = { length: 400, width: 300, height: 200 };

  it('không có kiện nào đỡ (sàn trống) -> floorZ = 0, floorSupportPlacement undefined', () => {
    const result = computeFloorZ({ x: 1000, y: 0, ...dragged }, []);
    expect(result.floorZ).toBe(0);
    expect(result.floorSupportPlacement).toBeUndefined();
  });

  it('footprint chồng khít lên 1 kiện đỡ -> floorZ = đúng mặt nóc kiện đó (mô phỏng "đang ở tầng 2")', () => {
    const result = computeFloorZ({ x: 0, y: 0, ...dragged }, [supportA]);
    expect(result.floorZ).toBe(200); // = supportA.height
    expect(result.floorSupportPlacement).toBe(supportA);
  });

  it('kéo NGANG ra khỏi vùng đang đỡ (footprint không còn chồng lên supportA) -> floorZ tự động rơi về 0 (sàn) — đúng kịch bản yêu cầu: hạ tầng 2 -> 1 chỉ bằng cách kéo ngang', () => {
    // supportA chiếm x:[0,400) y:[0,300) — kéo ngang hẳn sang x:[1000,1400) (không còn chồng lấn).
    const result = computeFloorZ({ x: 1000, y: 0, ...dragged }, [supportA]);
    expect(result.floorZ).toBe(0); // rơi thẳng xuống sàn — KHÔNG giữ nguyên độ cao tầng 2 cũ
    expect(result.floorSupportPlacement).toBeUndefined();
  });

  it('kéo ngang vào đúng phía trên 1 kiện KHÁC CAO HƠN -> floorZ tự động lên đúng nóc kiện đó (đối xứng với chiều hạ xuống — không bị coi nhầm là "chặn trên" như snapVerticalPosition cũ)', () => {
    // supportB CAO HƠN hẳn chiều cao/2 của dragged — đây chính là trường hợp snapVerticalPosition
    // (thiết kế cho model kéo Z tự do) sẽ phân loại SAI thành "chặn trên" nếu bị ép z:0, buộc phải
    // có computeFloorZ riêng cho đúng ngữ nghĩa trọng lực (không có khái niệm ceiling).
    const supportB: SnapBox3D = { x: 1000, y: 0, z: 0, length: 400, width: 300, height: 350 };
    const result = computeFloorZ({ x: 1000, y: 0, ...dragged }, [supportA, supportB]);
    expect(result.floorZ).toBe(350); // = supportB.height, tự động LÊN tầng cao hơn
    expect(result.floorSupportPlacement).toBe(supportB);
  });

  it('nhiều kiện đỡ chồng chéo footprint -> floorZ là mặt nóc CAO NHẤT trong số chúng (không lọt xuống dưới bất kỳ kiện nào)', () => {
    const lower: SnapBox3D = { x: 0, y: 0, z: 0, length: 400, width: 300, height: 150 };
    const higher: SnapBox3D = { x: 0, y: 0, z: 0, length: 400, width: 300, height: 300 };
    const result = computeFloorZ({ x: 0, y: 0, ...dragged }, [lower, higher]);
    expect(result.floorZ).toBe(300);
    expect(result.floorSupportPlacement).toBe(higher);
  });
});
