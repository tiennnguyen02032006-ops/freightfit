import type { UnfitReason } from '../../domain/types';

export interface UnfitAttemptInfo {
  exceedsPayloadAlone: boolean;
  noOrientationFitsContainerBounds: boolean;
  allFailuresWereStacking: boolean;
}

/**
 * Thứ tự ưu tiên khi nhiều nguyên nhân cùng đúng: OVERWEIGHT > ROTATION_CONFLICT >
 * STACK_CONFLICT > NO_SPACE. Giả định vì docs/algorithm-design.md không quy định thứ tự này.
 */
export function determineUnfitReason(info: UnfitAttemptInfo): UnfitReason {
  if (info.exceedsPayloadAlone) return 'OVERWEIGHT';
  if (info.noOrientationFitsContainerBounds) return 'ROTATION_CONFLICT';
  if (info.allFailuresWereStacking) return 'STACK_CONFLICT';
  return 'NO_SPACE';
}
