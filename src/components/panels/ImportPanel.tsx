import { useState } from 'react';
import { useAppStore } from '../../store';
import { parseExcelFile, mapRowToCargoTemplate, type LengthUnit } from '../../import/parseExcel';
import { generateDistinctColor, normalizeHexColor } from '../../utils/colorBySku';
import { getPersistedSkuColor, setPersistedSkuColor } from '../../utils/skuColorStorage';

export function ImportPanel() {
  const cargoImportRows = useAppStore((s) => s.cargoImportRows);
  const setImportRows = useAppStore((s) => s.setImportRows);
  const addCargoTemplates = useAppStore((s) => s.addCargoTemplates);
  const cargoTemplates = useAppStore((s) => s.cargoTemplates);

  const [unit, setUnit] = useState<LengthUnit>('cm');
  const [isParsing, setIsParsing] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    try {
      const rows = await parseExcelFile(file);
      setImportRows(rows);
    } finally {
      setIsParsing(false);
      event.target.value = '';
    }
  };

  const handleCommit = () => {
    const validRows = cargoImportRows.filter((r) => r.valid);
    // Màu: ưu tiên màu đã lưu từ trước cho đúng SKU (kể cả sau F5) > cột "Màu" trong file >
    // tự sinh màu mới khác các màu đang có. usedColors tích lũy dần trong vòng lặp để các dòng
    // mới trong CÙNG 1 lần import cũng không trùng màu nhau.
    const usedColors = cargoTemplates.map((t) => t.color);
    const templates = validRows.map((row) => {
      const persistedColor = getPersistedSkuColor(row.sku);
      const color = persistedColor ?? normalizeHexColor(row.colorRaw) ?? generateDistinctColor(usedColors);
      usedColors.push(color);
      if (!persistedColor) setPersistedSkuColor(row.sku, color);

      return mapRowToCargoTemplate(row, { unit, color });
    });
    addCargoTemplates(templates);
    setImportRows([]);
  };

  const validCount = cargoImportRows.filter((r) => r.valid).length;
  const invalidCount = cargoImportRows.length - validCount;

  return (
    <details className="panel import-panel">
      <summary>Hoặc import từ Excel/CSV</summary>
      <div className="import-body">
        <label>
          Đơn vị kích thước trong file:
          <select value={unit} onChange={(e) => setUnit(e.target.value as LengthUnit)}>
            <option value="cm">cm</option>
            <option value="in">inch</option>
            <option value="ft">feet</option>
          </select>
        </label>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} disabled={isParsing} />

        {cargoImportRows.length > 0 && (
          <div className="import-summary">
            <p>
              {validCount} hàng hợp lệ, {invalidCount} hàng lỗi.
            </p>
            <ul className="import-error-list">
              {cargoImportRows
                .filter((r) => !r.valid)
                .map((r) => (
                  <li key={r.rowIndex}>
                    Dòng {r.rowIndex + 1} ({r.sku || '(không có SKU)'}): {r.errors?.join(', ')}
                  </li>
                ))}
            </ul>
            <button type="button" disabled={validCount === 0} onClick={handleCommit}>
              Xác nhận nhập {validCount} hàng hợp lệ
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
