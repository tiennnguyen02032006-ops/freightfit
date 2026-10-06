import type { CargoTemplate, DangerClass, GroupKey, RuleKey, SegregationPlan, SegregationRule, SpecialGroup } from '../domain/types';

// Nhóm hàng đặc biệt và quy tắc "nhóm nào không được chung container". Chỉ là công cụ lập kế hoạch theo quy tắc NGƯỜI
// DÙNG đặt — các cặp mặc định chỉ mang tính ví dụ, KHÔNG thay cho quy định IMDG hiện hành.

export const DANGER_CLASSES: DangerClass[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const SPECIAL_GROUPS: Array<{ id: 'GENERAL' | SpecialGroup; label: string }> = [
  { id: 'GENERAL', label: 'Hàng thường' },
  { id: 'FOOD', label: 'Thực phẩm' },
  { id: 'ODOROUS', label: 'Hàng có mùi' },
  { id: 'CHEMICAL', label: 'Hóa chất' },
  { id: 'DANGEROUS', label: 'Hàng nguy hiểm' },
];

export function groupLabel(key: RuleKey): string {
  switch (key) {
    case 'GENERAL':
      return 'Hàng thường';
    case 'FOOD':
      return 'Thực phẩm';
    case 'ODOROUS':
      return 'Hàng có mùi';
    case 'CHEMICAL':
      return 'Hóa chất';
    case 'DANGEROUS':
      return 'Hàng nguy hiểm (mọi lớp)';
    default:
      return `Hàng nguy hiểm lớp ${key.slice(2)}`;
  }
}

/** Mọi khoá có thể dùng trong bảng quy tắc (nhóm cụ thể + "Hàng nguy hiểm (mọi lớp)"). */
export const RULE_KEYS: RuleKey[] = ['FOOD', 'ODOROUS', 'CHEMICAL', 'DANGEROUS', ...DANGER_CLASSES.map((c): RuleKey => `DG${c}`), 'GENERAL'];

/** Nhóm hiệu lực của 1 loại hàng: không đặt = hàng thường; hàng nguy hiểm thiếu lớp coi là lớp 3 (nhập thiếu đã bị form/import chặn). */
export function groupKeyOf(template: Pick<CargoTemplate, 'cargoGroup' | 'dangerClass'>): GroupKey {
  if (!template.cargoGroup) return 'GENERAL';
  if (template.cargoGroup === 'DANGEROUS') return `DG${template.dangerClass ?? 3}`;
  return template.cargoGroup;
}

/** Cặp mặc định (CHỈ LÀ VÍ DỤ): thực phẩm–hàng có mùi, hàng nguy hiểm–thực phẩm, thực phẩm–hóa chất, lớp 1–lớp 3. */
export const DEFAULT_SEGREGATION_RULES: SegregationRule[] = [
  { a: 'FOOD', b: 'ODOROUS' },
  { a: 'DANGEROUS', b: 'FOOD' },
  { a: 'FOOD', b: 'CHEMICAL' },
  { a: 'DG1', b: 'DG3' },
];

function ruleKeyMatches(key: GroupKey, ruleKey: RuleKey): boolean {
  return ruleKey === key || (ruleKey === 'DANGEROUS' && key.startsWith('DG'));
}

/** Quy tắc đầu tiên cấm 2 nhóm chung container (không phân biệt thứ tự a/b); null nếu không có. Cùng 1 nhóm không tự xung đột. */
export function findConflictingRule(a: GroupKey, b: GroupKey, rules: SegregationRule[]): SegregationRule | null {
  if (a === b) return null;
  return rules.find((r) => (ruleKeyMatches(a, r.a) && ruleKeyMatches(b, r.b)) || (ruleKeyMatches(a, r.b) && ruleKeyMatches(b, r.a))) ?? null;
}

export function groupsConflict(a: GroupKey, b: GroupKey, rules: SegregationRule[]): boolean {
  return findConflictingRule(a, b, rules) !== null;
}

/** Kiểm tra quy tắc mới trước khi thêm vào bảng; trả về lời báo lỗi hoặc null nếu hợp lệ. */
export function validateNewRule(rules: SegregationRule[], a: RuleKey, b: RuleKey): string | null {
  if (a === b && a !== 'DANGEROUS') return 'Chọn hai nhóm khác nhau';
  if (rules.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))) return 'Quy tắc này đã có';
  return null;
}

export interface CompatibleSet {
  groupKeys: GroupKey[];
  templateIds: string[];
}

/**
 * Chia các loại hàng thành các NHÓM TƯƠNG THÍCH (bộ): hai nhóm hàng có quy tắc xung đột luôn ở 2 bộ khác nhau; mỗi bộ được
 * xếp riêng vào các container của riêng nó. Tô màu đồ thị xung đột theo kiểu tham lam (nhóm nhiều xung đột xếp trước)
 * để dùng ít bộ — tức ít container — nhất có thể. Không có quy tắc nào bị vi phạm -> đúng 1 bộ.
 */
export function partitionCompatibleSets(templates: CargoTemplate[], rules: SegregationRule[]): CompatibleSet[] {
  const keysInOrder: GroupKey[] = [];
  for (const t of templates) {
    const key = groupKeyOf(t);
    if (!keysInOrder.includes(key)) keysInOrder.push(key);
  }
  if (keysInOrder.length === 0) return [];

  const degree = (key: GroupKey) => keysInOrder.filter((other) => groupsConflict(key, other, rules)).length;
  const ordered = [...keysInOrder].sort((a, b) => degree(b) - degree(a) || keysInOrder.indexOf(a) - keysInOrder.indexOf(b));

  const sets: GroupKey[][] = [];
  for (const key of ordered) {
    const target = sets.find((set) => set.every((other) => !groupsConflict(key, other, rules)));
    if (target) target.push(key);
    else sets.push([key]);
  }

  return sets.map((groupKeys) => ({
    groupKeys: keysInOrder.filter((k) => groupKeys.includes(k)),
    templateIds: templates.filter((t) => groupKeys.includes(groupKeyOf(t))).map((t) => t.id),
  }));
}

/**
 * Kế hoạch tách nhóm để hiển thị (kế hoạch xếp, PDF): các bộ, container của từng bộ, và LÝ DO tách (cặp nhóm đang có trong
 * lô hàng mà quy tắc cấm chung container, kèm SKU liên quan).
 */
export function buildSegregationPlan(
  sets: CompatibleSet[],
  templates: CargoTemplate[],
  rules: SegregationRule[],
  containerIdsBySet: string[][],
): SegregationPlan {
  const skusOf = (key: GroupKey) => templates.filter((t) => groupKeyOf(t) === key).map((t) => t.sku);
  const presentKeys = Array.from(new Set(templates.map(groupKeyOf)));

  const reasons: string[] = [];
  for (let i = 0; i < presentKeys.length; i++) {
    for (let j = i + 1; j < presentKeys.length; j++) {
      if (!groupsConflict(presentKeys[i], presentKeys[j], rules)) continue;
      reasons.push(
        `${groupLabel(presentKeys[i])} (${skusOf(presentKeys[i]).join(', ')}) và ${groupLabel(presentKeys[j])} (${skusOf(presentKeys[j]).join(', ')}) không được chung container theo quy tắc đã đặt — xếp riêng vào các container khác nhau`,
      );
    }
  }

  return {
    sets: sets.map((set, index) => ({
      index: index + 1,
      groupKeys: set.groupKeys,
      skus: templates.filter((t) => set.templateIds.includes(t.id)).map((t) => t.sku),
      containerIds: containerIdsBySet[index] ?? [],
    })),
    reasons,
  };
}

/** Các dòng ghi chú tách nhóm của 1 container (nhóm hàng trong container + lý do tách + nhắc IMDG) — dùng cho PDF/tổng quan. */
export function segregationNotesFor(plan: SegregationPlan | undefined, containerId: string): string[] {
  if (!plan) return [];
  const set = plan.sets.find((s) => s.containerIds.includes(containerId));
  const lines: string[] = [];
  if (set && (plan.reasons.length > 0 || set.groupKeys.some((k) => k !== 'GENERAL'))) {
    lines.push(`Nhóm hàng trong container này: ${set.groupKeys.map(groupLabel).join(', ')}`);
  }
  if (set?.containerNotes) lines.push(...set.containerNotes);
  lines.push(...plan.reasons);
  return lines;
}
