import type { UnfitReason } from '../domain/types';

// Guardrail ngôn từ UI (CLAUDE.md): không dùng "đảm bảo hàng không đổ khi vận chuyển",
// chỉ mô tả nguyên nhân kỹ thuật khiến hàng không xếp vừa.
const LABELS: Record<UnfitReason, string> = {
  NO_SPACE: 'Không còn không gian trống phù hợp',
  OVERWEIGHT: 'Vượt tải trọng cho phép của container',
  ROTATION_CONFLICT: 'Không có hướng xoay nào vừa với kích thước container',
  STACK_CONFLICT: 'Vi phạm giới hạn xếp chồng (stacking)',
};

export function unfitReasonLabel(reason: UnfitReason): string {
  return LABELS[reason];
}
