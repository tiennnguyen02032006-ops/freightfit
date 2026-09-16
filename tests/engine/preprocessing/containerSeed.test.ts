import { describe, expect, it } from 'vitest';
import { STANDARD_CONTAINER_TEMPLATES } from '../../../src/engine/preprocessing/containerSeed';

describe('STANDARD_CONTAINER_TEMPLATES', () => {
  it('có đủ 7 template chuẩn 20FT/20FT_REEFER/20FT_HC/40FT_GP/40FT_HC/40FT_REEFER/45FT', () => {
    // Không so trực tiếp toàn bộ mảng nữa vì containerLibrary còn có thêm các xe tải nhỏ
    // (standardType: 'CUSTOM_TRUCK', xem cuối containerSeed.ts) — chỉ kiểm tra đúng thứ tự/đủ 7
    // loại container ISO chuẩn, lọc riêng khỏi các xe tải.
    const isoTypes = STANDARD_CONTAINER_TEMPLATES.map((t) => t.standardType).filter((t) => t !== 'CUSTOM_TRUCK');
    expect(isoTypes).toEqual(['20FT', '20FT_REEFER', '20FT_HC', '40FT_GP', '40FT_HC', '40FT_REEFER', '45FT']);
  });

  it('có thêm các xe tải nhỏ (CUSTOM_TRUCK), mỗi xe id duy nhất', () => {
    const trucks = STANDARD_CONTAINER_TEMPLATES.filter((t) => t.standardType === 'CUSTOM_TRUCK');
    expect(trucks.length).toBeGreaterThan(0);
    const ids = trucks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('mỗi template có kích thước và maxPayload dương, không phải custom', () => {
    for (const template of STANDARD_CONTAINER_TEMPLATES) {
      expect(template.innerLength).toBeGreaterThan(0);
      expect(template.innerWidth).toBeGreaterThan(0);
      expect(template.innerHeight).toBeGreaterThan(0);
      expect(template.maxPayload).toBeGreaterThan(0);
      expect(template.isCustom).toBe(false);
    }
  });

  it('20ft Reefer (20RF) có đúng kích thước lòng trong, maxPayload mức thấp nhất và ghi chú nhiệt độ', () => {
    const reefer = STANDARD_CONTAINER_TEMPLATES.find((t) => t.standardType === '20FT_REEFER');
    expect(reefer).toBeDefined();
    expect(reefer?.innerLength).toBe(5470);
    expect(reefer?.innerWidth).toBe(2290);
    expect(reefer?.innerHeight).toBe(2250);
    expect(reefer?.maxPayload).toBe(21000);
    expect(reefer?.notes).toBe('Nhiệt độ tối thiểu: -25°C');
  });

  it('20ft High Cube (20HC) có đúng kích thước lòng trong, trọng lượng và không còn ghi chú cảnh báo', () => {
    const hc20 = STANDARD_CONTAINER_TEMPLATES.find((t) => t.standardType === '20FT_HC');
    expect(hc20).toBeDefined();
    expect(hc20?.innerLength).toBe(5910);
    expect(hc20?.innerWidth).toBe(2345);
    expect(hc20?.innerHeight).toBe(2690);
    expect(hc20?.tareWeight).toBe(2420);
    expect(hc20?.grossWeight).toBe(30480);
    expect(hc20?.maxPayload).toBe(28060);
    expect(hc20?.notes).toBeUndefined();
  });

  it('20ft Standard có đúng kích thước lòng trong và maxPayload theo số liệu ISO 668 cập nhật', () => {
    const std20 = STANDARD_CONTAINER_TEMPLATES.find((t) => t.standardType === '20FT');
    expect(std20).toBeDefined();
    expect(std20?.innerHeight).toBe(2395);
    expect(std20?.maxPayload).toBe(28280);
  });

  it('40ft HC có đúng chiều dài lòng trong và maxPayload theo số liệu cập nhật', () => {
    const hc40 = STANDARD_CONTAINER_TEMPLATES.find((t) => t.standardType === '40FT_HC');
    expect(hc40).toBeDefined();
    expect(hc40?.innerLength).toBe(12023);
    expect(hc40?.maxPayload).toBe(26500);
  });

  it('40ft Reefer (40RF) có đúng kích thước lòng trong, maxPayload và ghi chú container lạnh', () => {
    const reefer40 = STANDARD_CONTAINER_TEMPLATES.find((t) => t.standardType === '40FT_REEFER');
    expect(reefer40).toBeDefined();
    expect(reefer40?.innerLength).toBe(11558);
    expect(reefer40?.innerWidth).toBe(2291);
    expect(reefer40?.innerHeight).toBe(2225);
    expect(reefer40?.maxPayload).toBe(28000);
    expect(reefer40?.notes).toBe('Container lạnh, dùng cho hàng đông lạnh/hàng lạnh khối lượng lớn');
  });

  it('45ft có đúng chiều rộng lòng trong và maxPayload theo số liệu cập nhật', () => {
    const ft45 = STANDARD_CONTAINER_TEMPLATES.find((t) => t.standardType === '45FT');
    expect(ft45).toBeDefined();
    expect(ft45?.innerWidth).toBe(2438);
    expect(ft45?.maxPayload).toBe(25680);
  });
});
