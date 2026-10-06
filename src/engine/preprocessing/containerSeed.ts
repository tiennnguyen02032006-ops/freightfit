import type { ContainerTemplate } from '../../domain/types';

// Kích thước lòng trong (mm) và maxPayload (kg) theo số liệu ISO container phổ biến.
// Giả định cần xác nhận lại với số liệu thực tế của công ty trước khi dùng cho production.
export const STANDARD_CONTAINER_TEMPLATES: ContainerTemplate[] = [
  {
    id: 'std-20ft',
    name: '20ft Standard',
    standardType: '20FT',
    innerLength: 5898,
    innerWidth: 2352,
    innerHeight: 2395,
    tareWeight: 2200,
    grossWeight: 30480,
    maxPayload: 28280,
    doorWidth: 2340,
    doorHeight: 2280,
    isCustom: false,
  },
  {
    id: 'std-20ft-reefer',
    name: '20ft Reefer (20RF)',
    standardType: '20FT_REEFER',
    innerLength: 5470,
    innerWidth: 2290,
    innerHeight: 2250,
    // Payload reefer dao động 21.000–27.000kg tùy hãng — lấy mức thấp nhất trong khoảng để an
    // toàn (không claim payload cao hơn thực tế cho phép).
    maxPayload: 21000,
    notes: 'Nhiệt độ tối thiểu: -25°C',
    refrigerated: true,
    // Vạch giới hạn xếp (red line) thấp hơn lòng xe; số liệu giả định, đối chiếu thông số thiết bị thực tế.
    maxStackHeight: 2150,
    isCustom: false,
  },
  {
    id: 'std-20ft-hc',
    name: '20ft High Cube (20HC)',
    standardType: '20FT_HC',
    innerLength: 5910,
    innerWidth: 2345,
    innerHeight: 2690,
    tareWeight: 2420,
    grossWeight: 30480,
    maxPayload: 28060,
    isCustom: false,
  },
  {
    id: 'std-40ft-gp',
    name: '40ft GP',
    standardType: '40FT_GP',
    innerLength: 12032,
    innerWidth: 2352,
    innerHeight: 2393,
    tareWeight: 3700,
    grossWeight: 32500,
    maxPayload: 28800,
    isCustom: false,
  },
  {
    id: 'std-40ft-hc',
    name: '40ft HC',
    standardType: '40FT_HC',
    innerLength: 12023,
    innerWidth: 2352,
    innerHeight: 2698,
    // Lưu ý: tareWeight/grossWeight giữ nguyên số cũ (3940 / 32500) vì yêu cầu chỉ nêu đổi
    // maxPayload — 32500-3940=28560 nên không còn khớp maxPayload mới (26500) nữa. Không ảnh
    // hưởng engine (chỉ maxPayload được packContainer dùng để check payload), nhưng nếu sau này
    // cần số liệu tare/gross chính xác theo chuẩn mới thì phải xác nhận lại và sửa cả hai.
    tareWeight: 3940,
    grossWeight: 32500,
    maxPayload: 26500,
    isCustom: false,
  },
  {
    id: 'std-40ft-reefer',
    name: '40ft Reefer (40RF)',
    standardType: '40FT_REEFER',
    innerLength: 11558,
    innerWidth: 2291,
    innerHeight: 2225,
    maxPayload: 28000,
    notes: 'Container lạnh, dùng cho hàng đông lạnh/hàng lạnh khối lượng lớn',
    refrigerated: true,
    maxStackHeight: 2130,
    isCustom: false,
  },
  {
    id: 'std-45ft',
    name: '45ft',
    standardType: '45FT',
    innerLength: 13556,
    innerWidth: 2438,
    innerHeight: 2698,
    // Lưu ý: tareWeight/grossWeight giữ nguyên số cũ (4800 / 32500) vì yêu cầu chỉ nêu đổi
    // innerWidth/maxPayload — 32500-4800=27700 nên không còn khớp maxPayload mới (25680) nữa.
    // Không ảnh hưởng engine (chỉ maxPayload được packContainer dùng để check payload), nhưng
    // nếu sau này cần số liệu tare/gross chính xác theo chuẩn mới thì phải xác nhận lại và sửa cả hai.
    tareWeight: 4800,
    grossWeight: 32500,
    maxPayload: 25680,
    isCustom: false,
  },
  {
    id: 'std-truck-hyundai-porter-h150',
    name: 'Xe tải Hyundai Porter H150 1.5 tấn (thùng kín)',
    standardType: 'CUSTOM_TRUCK',
    innerLength: 3140,
    innerWidth: 1620,
    innerHeight: 1820,
    maxPayload: 1200,
    isCustom: false,
  },
  {
    id: 'std-truck-hyundai-n250sl',
    name: 'Xe tải Hyundai N250SL 2.5 tấn (thùng kín, dài 4m3)',
    standardType: 'CUSTOM_TRUCK',
    innerLength: 4450,
    innerWidth: 1780,
    innerHeight: 1660,
    maxPayload: 2150,
    isCustom: false,
  },
  {
    id: 'std-truck-isuzu-npr85ke4',
    name: 'Xe tải Isuzu NPR85KE4 3.5 tấn (thùng kín)',
    standardType: 'CUSTOM_TRUCK',
    innerLength: 5150,
    innerWidth: 2135,
    innerHeight: 1900,
    maxPayload: 3490,
    isCustom: false,
  },
  {
    id: 'std-truck-isuzu-5t5',
    name: 'Xe tải Isuzu 5.5 tấn (thùng kín)',
    standardType: 'CUSTOM_TRUCK',
    innerLength: 5800,
    innerWidth: 2100,
    innerHeight: 2060,
    // maxPayload lấy theo tên dòng xe "5,5 tấn", chưa có số tải trọng chính xác hơn (theo giấy
    // đăng kiểm) — cần xác nhận lại trước khi dùng cho production.
    maxPayload: 5500,
    isCustom: false,
  },
  {
    id: 'std-truck-veam-vt750-tk',
    name: 'Xe tải Veam VT750 TK (thùng kín)',
    standardType: 'CUSTOM_TRUCK',
    innerLength: 6050,
    innerWidth: 2050,
    innerHeight: 1870,
    maxPayload: 7300,
    isCustom: false,
  },
];
