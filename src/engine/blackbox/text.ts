// Nhãn tiếng Việt cho Black Box. Ngôn từ tuân theo guardrail của dự án: đây là SUY LUẬN từ dữ liệu,
// không dùng cách nói khẳng định tuyệt đối.
import type { BlackBoxCause, BlackBoxFeatureName, BlackBoxSource } from '../../domain/types';

export const CAUSE_LABEL: Record<BlackBoxCause, string> = {
  "offplan_handling": "Bốc/dỡ hàng ngoài kế hoạch",
  "traffic": "Kẹt xe / gián đoạn giao thông",
  "reefer_failure": "Hỏng thiết bị làm lạnh",
  "route_deviation": "Đi lệch tuyến",
  "breakdown": "Xe hỏng hóc kỹ thuật",
  "driver_rest": "Tài xế nghỉ quá lâu"
};

export const SOURCE_LABEL: Record<BlackBoxSource, string> = {
  "gps": "dữ liệu GPS",
  "temp": "cảm biến nhiệt độ",
  "door": "cảm biến cửa",
  "camera": "camera/ảnh hiện trường",
  "engine": "telemetry động cơ/lỗi thiết bị lạnh",
  "traffic": "dữ liệu giao thông",
  "docs": "chứng từ (số kiện xếp/giao)",
  "driver": "lời khai tài xế"
};

export const FEATURE_SOURCE: Record<BlackBoxFeatureName, BlackBoxSource> = {
  "stop_dur": "gps",
  "crawl": "gps",
  "offroute": "gps",
  "delay": "gps",
  "temp_exc": "temp",
  "temp_onset": "temp",
  "temp_slope": "temp",
  "door": "door",
  "camera": "camera",
  "engine_off": "engine",
  "fault": "engine",
  "traffic_hi": "traffic",
  "count_mismatch": "docs",
  "driver_contra": "driver"
};

export const CAUSE_ACTIONS: Record<BlackBoxCause, string[]> = {
  "offplan_handling": [
    "Siết quy trình: mọi lần mở cửa ngoài kế hoạch phải có lệnh + ảnh xác nhận",
    "Đối chiếu số kiện tại điểm giao, mở claim nếu thiếu hàng",
    "Làm việc với tài xế về lần dừng và lời khai không khớp"
  ],
  "traffic": [
    "Tăng thời gian đệm (buffer) cho khung giờ/tuyến này",
    "Cảnh báo sớm khách hàng khi chỉ số giao thông vượt ngưỡng",
    "Cân nhắc đổi giờ xuất phát hoặc tuyến thay thế"
  ],
  "reefer_failure": [
    "Đưa thiết bị làm lạnh vào bảo trì và kiểm tra trước chuyến",
    "Kiểm tra chất lượng lô hàng trước khi giao, lưu bằng chứng nhiệt độ cho claim",
    "Bổ sung cảnh báo nhiệt độ theo thời gian thực"
  ],
  "route_deviation": [
    "Xác minh lý do đi lệch tuyến (đường cấm, tự ý, bốc hàng giữa đường)",
    "Bật cảnh báo lệch tuyến (geofence)",
    "Làm việc với tài xế về lời khai"
  ],
  "breakdown": [
    "Rà soát lịch bảo dưỡng phương tiện",
    "Chuẩn bị xe dự phòng cho tuyến quan trọng",
    "Kiểm tra thiệt hại nhiệt độ khi xe hỏng"
  ],
  "driver_rest": [
    "Kiểm tra quy định thời gian nghỉ và kế hoạch điểm nghỉ",
    "Đưa thời gian nghỉ hợp lệ vào ETA để tránh trễ giả"
  ]
};

const VALUE_LABEL: Record<string, string> = {
  "stop_dur|short": "GPS: dừng xe 10–20 phút",
  "stop_dur|medium": "GPS: dừng xe 20–40 phút",
  "stop_dur|long": "GPS: dừng xe trên 40 phút",
  "stop_dur|none": "GPS: không có lần dừng bất thường",
  "crawl|yes": "GPS: xe bò chậm kéo dài (<15 km/h)",
  "crawl|no": "GPS: không có đoạn bò chậm",
  "offroute|yes": "GPS: lệch khỏi tuyến kế hoạch >1,5 km",
  "offroute|no": "GPS: bám sát tuyến kế hoạch",
  "temp_exc|none": "Nhiệt độ: trong ngưỡng",
  "temp_exc|mild": "Nhiệt độ: tăng nhẹ (1,5–4°C)",
  "temp_exc|major": "Nhiệt độ: tăng mạnh (>4°C)",
  "temp_onset|in_stop": "Nhiệt độ bắt đầu tăng đúng lúc xe dừng",
  "temp_onset|in_motion": "Nhiệt độ bắt đầu tăng khi xe đang chạy",
  "temp_slope|fast": "Nhiệt độ tăng rất nhanh (>0,2°C/phút)",
  "temp_slope|slow": "Nhiệt độ tăng chậm, đều",
  "door|no": "Cảm biến cửa: không mở cửa",
  "door|brief": "Cảm biến cửa: mở thoáng qua (<5 phút)",
  "door|long": "Cảm biến cửa: mở cửa kéo dài (≥5 phút)",
  "camera|yes": "Camera: có hoạt động bốc/dỡ",
  "camera|no": "Camera: không thấy hoạt động",
  "engine_off|yes": "Động cơ tắt trong lúc dừng",
  "engine_off|no": "Động cơ vẫn nổ trong lúc dừng",
  "fault|engine": "Có mã lỗi động cơ",
  "fault|reefer": "Có cảnh báo lỗi thiết bị làm lạnh",
  "fault|none": "Không có mã lỗi nào",
  "traffic_hi|yes": "Dữ liệu giao thông: đường tắc đúng khung giờ chậm",
  "traffic_hi|no": "Dữ liệu giao thông: đường thông thoáng",
  "count_mismatch|yes": "Chứng từ: số kiện giao thiếu so với lúc xếp",
  "count_mismatch|no": "Chứng từ: số kiện khớp",
  "driver_contra|yes": "Lời khai tài xế MÂU THUẪN với cảm biến",
  "driver_contra|no": "Lời khai tài xế khớp với cảm biến",
  "delay|small": "Chậm <20 phút",
  "delay|moderate": "Chậm 20–60 phút",
  "delay|large": "Chậm >60 phút"
};

export function valueLabel(feature: BlackBoxFeatureName, value: string): string {
  return VALUE_LABEL[`${feature}|${value}`] ?? `${feature}: ${value}`;
}
