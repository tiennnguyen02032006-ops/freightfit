import type { CenterOfGravityWarning, ContainerTemplate, Placement } from '../../domain/types';

// Ngưỡng cảnh báo lệch trọng tâm — CHỈ cảnh báo UI, không phải hard constraint (xem CLAUDE.md
// mục Phase 2: "Center of gravity toàn container + cảnh báo lệch trục (UI warning, không phải
// hard block)"). Một hằng số DUY NHẤT cho mỗi trục, không rải rác nhiều nơi.
export const CG_OFFSET_X_WARNING_RATIO = 0.1; // lệch ngang > 10% chiều rộng container
export const CG_OFFSET_Z_WARNING_RATIO = 0.15; // lệch dọc > 15% chiều dài container

/**
 * Trọng tâm = Σ(khối lượng kiện × tọa độ tâm kiện đó) ÷ tổng khối lượng, tính riêng theo 3 trục
 * NỘI BỘ của engine (x = chiều dài tính từ cửa, y = chiều rộng, z = chiều cao — xem
 * packContainer.ts/Placement). Tách thành hàm riêng (thay vì để inline trong packContainer.ts)
 * để test được độc lập công thức, không cần dựng cả container/extreme point.
 */
export function computeCenterOfGravity(placements: Placement[]): { x: number; y: number; z: number } {
  const totalWeight = placements.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight === 0) return { x: 0, y: 0, z: 0 };
  return {
    x: placements.reduce((sum, p) => sum + p.centerX * p.weight, 0) / totalWeight,
    y: placements.reduce((sum, p) => sum + p.centerY * p.weight, 0) / totalWeight,
    z: placements.reduce((sum, p) => sum + p.centerZ * p.weight, 0) / totalWeight,
  };
}

export interface CgOffsets {
  offsetXRatio: number; // lệch ngang / chiều rộng container, 0..1+
  offsetZRatio: number; // lệch dọc / chiều dài container, 0..1+
}

/**
 * Đổi tên gọi trục cho khớp góc nhìn người dùng của tính năng này (X = chiều rộng, tâm ở giữa;
 * Z = chiều dài, tâm ở giữa) — KHÔNG đổi giá trị lưu trữ, chỉ đọc đúng field engine tương ứng:
 * "lệch ngang" (X người dùng) = centerOfGravity.y (trục rộng của engine) so với innerWidth/2;
 * "lệch dọc" (Z người dùng) = centerOfGravity.x (trục dài của engine, gốc ở cửa) so với
 * innerLength/2.
 */
export function computeCgOffsets(
  centerOfGravity: { x: number; y: number; z: number },
  containerTemplate: ContainerTemplate,
): CgOffsets {
  const offsetXRatio =
    containerTemplate.innerWidth > 0
      ? Math.abs(centerOfGravity.y - containerTemplate.innerWidth / 2) / containerTemplate.innerWidth
      : 0;
  const offsetZRatio =
    containerTemplate.innerLength > 0
      ? Math.abs(centerOfGravity.x - containerTemplate.innerLength / 2) / containerTemplate.innerLength
      : 0;
  return { offsetXRatio, offsetZRatio };
}

function severityFor(ratio: number, threshold: number): CenterOfGravityWarning['severity'] {
  return ratio > threshold * 1.5 ? 'HIGH' : 'MEDIUM';
}

/** Chỉ sinh warning cho trục VƯỢT ngưỡng — dưới ngưỡng coi như bình thường, không cảnh báo. */
export function computeCgWarnings(containerInstanceId: string, offsets: CgOffsets): CenterOfGravityWarning[] {
  const warnings: CenterOfGravityWarning[] = [];
  if (offsets.offsetXRatio > CG_OFFSET_X_WARNING_RATIO) {
    warnings.push({
      containerInstanceId,
      axis: 'X',
      offsetRatio: offsets.offsetXRatio,
      severity: severityFor(offsets.offsetXRatio, CG_OFFSET_X_WARNING_RATIO),
    });
  }
  if (offsets.offsetZRatio > CG_OFFSET_Z_WARNING_RATIO) {
    warnings.push({
      containerInstanceId,
      axis: 'Z',
      offsetRatio: offsets.offsetZRatio,
      severity: severityFor(offsets.offsetZRatio, CG_OFFSET_Z_WARNING_RATIO),
    });
  }
  return warnings;
}
