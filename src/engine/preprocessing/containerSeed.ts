import type { ContainerTemplate } from '../../domain/types';

// Kích thước lòng trong (mm) và maxPayload (kg) theo số liệu ISO container phổ biến.
// Giả định cần xác nhận lại với số liệu thực tế của công ty trước khi dùng cho production.
//
// costPerKm/costPerTrip: đơn giá cước (VNĐ/km) và giá thuê/vận chuyển 1 container (VNĐ/container)
// dùng cho TransportCostPanel — mức giá THAM KHẢO theo mặt bằng vận tải đường bộ Việt Nam (xe đầu
// kéo chở container nội địa, giá dao động theo tuyến/hãng/thời điểm), CẦN XÁC NHẬN LẠI với đơn giá
// thực tế của công ty trước khi dùng để báo giá chính thức. Container lớn/lạnh thì cả 2 mức đều
// cao hơn (xe kéo nặng hơn, tốn nhiên liệu hơn, phí thuê thiết bị lạnh cao hơn).
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
    costPerKm: 17000,
    costPerTrip: 800000,
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
    costPerKm: 27000,
    costPerTrip: 1300000,
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
    costPerKm: 18000,
    costPerTrip: 850000,
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
    costPerKm: 22000,
    costPerTrip: 1000000,
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
    costPerKm: 23000,
    costPerTrip: 1050000,
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
    costPerKm: 30000,
    costPerTrip: 1500000,
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
    costPerKm: 25000,
    costPerTrip: 1100000,
    isCustom: false,
  },
];
