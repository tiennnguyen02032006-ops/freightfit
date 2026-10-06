import type { CargoTemplate, ContainerTemplate, ToleranceSettings } from '../domain/types';
import { NO_TOLERANCE, REEFER_AIR_GAP_MM } from './config';
import { effectiveTolerance, palletGapOf } from './tolerance';

// Hàng lạnh + container lạnh (reefer): nhiệt độ cài đặt theo từng loại hàng, vạch giới hạn chiều cao xếp của container
// lạnh, khe luồng khí quanh hàng. Chỉ là công cụ lập kế hoạch theo số liệu NGƯỜI DÙNG nhập — không mô phỏng nhiệt/luồng khí.

export function isReefer(container: Pick<ContainerTemplate, 'refrigerated'>): boolean {
  return container.refrigerated === true;
}

/** Hàng lạnh = có nhiệt độ cài đặt (°C). */
export function isColdCargo(template: Pick<CargoTemplate, 'setTemperatureC'>): boolean {
  return typeof template.setTemperatureC === 'number' && Number.isFinite(template.setTemperatureC);
}

/** Chiều cao xếp tối đa (mm, tính từ sàn): vạch giới hạn của container lạnh (không vượt lòng xe), còn lại là chiều cao lòng xe. */
export function stackHeightLimit(container: Pick<ContainerTemplate, 'refrigerated' | 'maxStackHeight' | 'innerHeight'>): number {
  const line = container.maxStackHeight;
  if (container.refrigerated && typeof line === 'number' && line > 0) return Math.min(container.innerHeight, line);
  return container.innerHeight;
}

/** Container dùng để xếp/kiểm tra: lòng xe bị hạ xuống đúng vạch giới hạn nên không món nào vượt vạch. Không có vạch -> chính container. */
export function packableContainer<T extends ContainerTemplate>(container: T): T {
  const limit = stackHeightLimit(container);
  return limit < container.innerHeight ? { ...container, innerHeight: limit } : container;
}

/** Dung sai khi xếp trong container lạnh: mỗi loại hàng và khe pallet/vách ít nhất bằng khe luồng khí. */
export function reeferTolerance(settings: ToleranceSettings = NO_TOLERANCE, airGap = REEFER_AIR_GAP_MM): ToleranceSettings {
  return {
    enabled: true,
    defaultDimensionTolerance: Math.max(settings.enabled ? settings.defaultDimensionTolerance : 0, airGap),
    palletGap: Math.max(palletGapOf(settings), airGap),
  };
}

/** Mỗi loại hàng được chừa ít nhất khe luồng khí quanh hàng (qua trường dung sai/clearance sẵn có). */
export function withAirGap(templates: CargoTemplate[], settings: ToleranceSettings = NO_TOLERANCE, airGap = REEFER_AIR_GAP_MM): CargoTemplate[] {
  return templates.map((t) => ({ ...t, tolerance: Math.max(effectiveTolerance(t, settings), airGap) }));
}

const fmtNumber = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

export function formatTemperature(celsius: number): string {
  return `${fmtNumber(celsius)} °C`;
}

/** Các dòng ghi chú của 1 container lạnh (hiển thị ở kế hoạch và PDF): nhiệt độ cài đặt, vạch chiều cao, khe luồng khí. */
export function describeReeferContainer(container: ContainerTemplate, temperatureC?: number, airGap = REEFER_AIR_GAP_MM): string[] {
  const lines: string[] = [];
  if (temperatureC !== undefined) lines.push(`Nhiệt độ cài đặt: ${formatTemperature(temperatureC)}`);
  const limit = stackHeightLimit(container);
  if (limit < container.innerHeight) {
    lines.push(`Vạch giới hạn chiều cao xếp: ${fmtNumber(limit / 10)} cm — hàng không xếp vượt vạch`);
  }
  lines.push(`Đã chừa khe luồng khí ${fmtNumber(airGap / 10)} cm quanh hàng`);
  return lines;
}
