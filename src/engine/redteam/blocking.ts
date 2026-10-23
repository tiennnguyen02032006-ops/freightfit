import type { RedTeamBlockLink, RedTeamPallet } from '../../domain/types';

// Pallet P CHẮN pallet Q khi muốn lấy Q ra khỏi container thì phải dời P trước:
//  - DOOR: P nằm giữa Q và cửa (gần cửa hơn), chồng nhau theo chiều ngang (cùng làn) và theo chiều cao;
//  - TOP: P nằm đè lên trên Q.
// Hai pallet cùng đơn không chắn nhau (dỡ cùng lúc). Dùng toạ độ thật (x tính từ cửa), mm.

const EPS = 1; // mm

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/** P có chắn Q không; trả về liên kết giải thích hoặc null. */
export function blockLink(p: RedTeamPallet, q: RedTeamPallet): RedTeamBlockLink | null {
  if (p.id === q.id || p.orderId === q.orderId) return null;
  const yOverlap = overlap(p.y, p.y + p.width, q.y, q.y + q.width) > EPS;
  const xOverlap = overlap(p.x, p.x + p.length, q.x, q.x + q.length) > EPS;
  const zOverlap = overlap(p.z, p.z + p.height, q.z, q.z + q.height) > EPS;

  let kind: RedTeamBlockLink['kind'] | null = null;
  if (xOverlap && yOverlap && p.z >= q.z + q.height - EPS) kind = 'TOP';
  else if (yOverlap && zOverlap && p.x + p.length <= q.x + EPS) kind = 'DOOR';
  if (!kind) return null;

  return {
    blockedPalletId: q.id,
    blockedOrderId: q.orderId,
    blockerPalletId: p.id,
    blockerOrderId: p.orderId,
    kind,
    lane: q.lane,
  };
}

/** Mọi cặp (blocker, blocked): `blockers` là các pallet còn trên xe, `targets` là các pallet cần lấy ra. */
export function findBlockLinks(blockers: RedTeamPallet[], targets: RedTeamPallet[]): RedTeamBlockLink[] {
  const links: RedTeamBlockLink[] = [];
  for (const q of targets) {
    for (const p of blockers) {
      const link = blockLink(p, q);
      if (link) links.push(link);
    }
  }
  return links;
}
