import { useState } from 'react';
import { useAppStore } from '../../store';
import type { RuleKey } from '../../domain/types';
import { DEFAULT_SEGREGATION_RULES, RULE_KEYS, groupLabel, validateNewRule } from '../../engine/segregation';

/**
 * Bảng quy tắc "nhóm hàng nào KHÔNG được chung container" (xem engine/segregation.ts). Người dùng thêm/xóa/khôi phục mặc
 * định; khi tạo phương án, app tự chia hàng thành các nhóm tương thích và xếp riêng từng nhóm vào các container khác
 * nhau. Các cặp mặc định chỉ là ví dụ — phải đối chiếu quy định IMDG hiện hành.
 */
export function SegregationRulesPanel() {
  const rules = useAppStore((s) => s.segregationRules);
  const setRules = useAppStore((s) => s.setSegregationRules);

  const [a, setA] = useState<RuleKey>('FOOD');
  const [b, setB] = useState<RuleKey>('ODOROUS');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    const problem = validateNewRule(rules, a, b);
    setError(problem);
    if (!problem) setRules([...rules, { a, b }]);
  };

  return (
    <div className="panel segregation-panel">
      <div className="panel-header">
        <h2>Quy tắc tách nhóm hàng</h2>
      </div>

      {rules.length === 0 ? (
        <p className="result-muted">Chưa có quy tắc nào — mọi nhóm hàng được phép chung container.</p>
      ) : (
        <ul className="segregation-list">
          {rules.map((rule, i) => (
            <li key={`${rule.a}-${rule.b}-${i}`} className="segregation-item">
              <span>
                {groupLabel(rule.a)} <span aria-hidden="true">≠</span> {groupLabel(rule.b)}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Xóa quy tắc ${groupLabel(rule.a)} và ${groupLabel(rule.b)}`}
                onClick={() => setRules(rules.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="form-grid segregation-add">
        <div className="unit-field">
          <label className="unit-field-label" htmlFor="segregation-a">
            Nhóm thứ nhất
          </label>
          <select id="segregation-a" value={a} onChange={(e) => setA(e.target.value as RuleKey)}>
            {RULE_KEYS.map((k) => (
              <option key={k} value={k}>
                {groupLabel(k)}
              </option>
            ))}
          </select>
        </div>
        <div className="unit-field">
          <label className="unit-field-label" htmlFor="segregation-b">
            Nhóm thứ hai
          </label>
          <select id="segregation-b" value={b} onChange={(e) => setB(e.target.value as RuleKey)}>
            {RULE_KEYS.map((k) => (
              <option key={k} value={k}>
                {groupLabel(k)}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <span className="unit-field-error unit-field-wide" role="alert">
            {error}
          </span>
        )}
      </div>

      <div className="form-actions">
        <button type="button" onClick={() => setRules(DEFAULT_SEGREGATION_RULES)}>
          Khôi phục mặc định
        </button>
        <button type="button" className="primary" onClick={handleAdd}>
          + Thêm quy tắc
        </button>
      </div>
    </div>
  );
}
