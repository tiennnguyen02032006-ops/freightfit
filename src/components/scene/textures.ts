import * as THREE from 'three';

let corrugatedCache: THREE.CanvasTexture | null = null;

/**
 * Texture tôn sóng vẽ bằng canvas (không tải ảnh ngoài): duyệt từng pixel, độ sáng biến
 * thiên theo hàm sin(x) để tạo hiệu ứng gợn sóng mượt thay vì các dải màu thẳng cứng.
 */
export function getCorrugatedTexture(): THREE.CanvasTexture {
  if (corrugatedCache) return corrugatedCache;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);

  const base = 208;
  const amplitude = 30;
  const wavelength = 16; // px / chu kỳ sóng
  const frequency = (Math.PI * 2) / wavelength;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wave = Math.sin(x * frequency) * amplitude;
      const shade = base + wave;
      const idx = (y * size + x) * 4;
      imageData.data[idx] = shade;
      imageData.data[idx + 1] = shade * 0.985;
      imageData.data[idx + 2] = shade * 0.95;
      imageData.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  corrugatedCache = texture;
  return texture;
}

let floorCache: THREE.CanvasTexture | null = null;

/**
 * Sàn nền xám nhạt + hoa văn chấm nổi nhẹ kiểu tấm sàn chống trượt (diamond plate), vẽ bằng
 * canvas, lặp lại (RepeatWrapping) để phủ kín sàn dù container to hay nhỏ.
 */
export function getFloorTexture(): THREE.CanvasTexture {
  if (floorCache) return floorCache;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#b7b0a0';
  ctx.fillRect(0, 0, size, size);

  const spacing = 10;
  for (let y = spacing / 2; y < size; y += spacing) {
    for (let x = spacing / 2; x < size; x += spacing) {
      const offsetX = (Math.round(y / spacing) % 2) * (spacing / 2);
      ctx.beginPath();
      ctx.arc((x + offsetX) % size, y, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc((x + offsetX) % size, y + 1, 1.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  floorCache = texture;
  return texture;
}
