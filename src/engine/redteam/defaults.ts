import type { RedTeamIncident, RedTeamParams, RedTeamStop } from '../../domain/types';

// TOÀN BỘ giá trị mặc định dưới đây là GIẢ ĐỊNH để minh hoạ mô phỏng theo luật — không phải số liệu đo thực tế. Người dùng
// chỉnh được mọi giá trị trên giao diện; giao diện luôn ghi rõ đây là mô phỏng với số liệu giả định.

export const REDTEAM_ASSUMPTIONS = {
  firstLegMinutes: 30,       // từ kho tới điểm đầu
  legMinutes: 20,            // giữa các điểm giao
  unloadMinutes: 10,         // dỡ hàng mỗi điểm
  deadlineSlackMinutes: 15,  // hạn giao mặc định = giờ xong kế hoạch + khoảng dư này
  earlyDepartMinutes: 15,    // phương án cứu "xuất phát sớm"
} as const;

export const REDTEAM_DEFAULT_PARAMS: RedTeamParams = {
  rehandleMinPerPallet: 2,
  extraUnloadMinPerPallet: 2.5,
  departureAdvanceMin: 0,
};

/** Điểm giao mặc định cho danh sách đơn theo thứ tự giao: hạn = giờ xong theo kế hoạch + khoảng dư giả định. */
export function defaultStops(orders: Array<{ id: string; name: string }>): RedTeamStop[] {
  const a = REDTEAM_ASSUMPTIONS;
  let clock = 0;
  return orders.map((order, i) => {
    const legMinutes = i === 0 ? a.firstLegMinutes : a.legMinutes;
    clock += legMinutes + a.unloadMinutes;
    return { id: order.id, name: order.name, legMinutes, unloadMinutes: a.unloadMinutes, deadlineMin: clock + a.deadlineSlackMinutes };
  });
}

/** Sự cố mặc định (giả định): xuất phát muộn, kẹt xe chặng 1, dỡ hàng chậm, đơn cuối giao sớm tại điểm 2. */
export function defaultIncidents(stops: RedTeamStop[]): RedTeamIncident[] {
  const incidents: RedTeamIncident[] = [
    { id: 'late-depart', label: 'Xuất phát muộn 10 phút', type: 'LATE_DEPART', minutes: 10 },
    { id: 'traffic', label: 'Kẹt xe 15 phút ở chặng 1', type: 'DELAY', minutes: 15, leg: 1 },
    { id: 'slow-unload', label: 'Dỡ hàng chậm 30%', type: 'SLOW_UNLOAD', percent: 30 },
  ];
  if (stops.length >= 3) {
    const last = stops[stops.length - 1];
    incidents.push({ id: 'expedite-last', label: `Đơn ${last.name} giao sớm tại điểm 2`, type: 'EXPEDITE', orderId: last.id, atPosition: 2 });
  }
  return incidents;
}
