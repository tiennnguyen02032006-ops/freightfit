import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function getContrastTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1a1a1a' : '#ffffff';
}

/** Vẽ nền màu + khung viền + chữ SKU căn giữa lên canvas — dùng chung cho box/cylinder/bag. */
function drawLabelBase(ctx: CanvasRenderingContext2D, size: number, sku: string, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 5;
  ctx.strokeRect(6, 6, size - 12, size - 12);

  ctx.fillStyle = getContrastTextColor(color);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let fontSize = 36;
  ctx.font = `bold ${fontSize}px sans-serif`;
  while (ctx.measureText(sku).width > size - 28 && fontSize > 12) {
    fontSize -= 2;
    ctx.font = `bold ${fontSize}px sans-serif`;
  }
  ctx.fillText(sku, size / 2, size / 2);
}

/**
 * Texture nền màu SKU + chữ SKU căn giữa — dùng làm `map` chung cho vật liệu kiện hàng, bất kể
 * hình dạng: BoxGeometry mặc định map UV 0..1 cho cả 6 mặt (in SKU lên MỌI mặt, không cần vật
 * liệu riêng từng mặt); CylinderGeometry map UV 0..1 quanh MẶT BÊN (U theo góc quanh trục, V theo
 * chiều cao) nên texture này cũng in được lên mặt bên hình trụ (xem CargoBox3D.tsx), 2 mặt đáy
 * hình trụ dùng vật liệu màu trơn riêng vì chữ SKU sẽ bị bóp méo nếu ép lên hình tròn. Cache theo
 * (sku, color) để không vẽ lại canvas mỗi lần render.
 */
export function getCargoLabelTexture(sku: string, color: string): THREE.CanvasTexture {
  const key = `${sku}|${color}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  drawLabelBase(ctx, size, sku, color);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  cache.set(key, texture);
  return texture;
}
