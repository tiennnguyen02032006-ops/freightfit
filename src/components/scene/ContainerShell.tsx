import { useMemo, useRef } from 'react';
import type { Mesh } from 'three';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { getCorrugatedTexture, getFloorTexture } from './textures';
import { containerWallThickness } from './containerGeometry';

interface ContainerShellProps {
  length: number;
  width: number;
  height: number;
}

const EDGE_COLOR = '#20222a';

type Vec3 = [number, number, number];

/**
 * So sánh vị trí camera với tâm + vector pháp tuyến hướng ra ngoài của 1 mặt: nếu camera nằm
 * về phía pháp tuyến (dot > 0) nghĩa là mặt đó đang chắn giữa camera và bên trong container ->
 * ẩn đi. Chạy mỗi khung hình qua useFrame, chỉnh trực tiếp mesh.visible qua ref (không setState)
 * để không gây re-render React mỗi frame.
 */
function useFaceCulling(
  refs: Array<{ ref: React.RefObject<Mesh | null>; center: Vec3; normal: Vec3 }>,
) {
  useFrame(({ camera }) => {
    for (const { ref, center, normal } of refs) {
      const mesh = ref.current;
      if (!mesh) continue;
      const dot =
        (camera.position.x - center[0]) * normal[0] +
        (camera.position.y - center[1]) * normal[1] +
        (camera.position.z - center[2]) * normal[2];
      mesh.visible = dot <= 0;
    }
  });
}

/**
 * Vỏ container đủ 6 mặt: sàn LUÔN hiện (đục, có hoa văn), 4 vách + nóc tự ẩn/hiện theo góc
 * camera (mặt nào đang quay ra phía camera — tức đang chắn tầm nhìn vào trong — sẽ ẩn đi) thay
 * vì làm mờ cố định như trước. Vách/nóc lúc hiện thì đục hoàn toàn (không dùng opacity nữa).
 */
export function ContainerShell({ length, width, height }: ContainerShellProps) {
  const maxDim = Math.max(length, width, height);
  const thickness = containerWallThickness(maxDim);

  const frontRef = useRef<Mesh>(null);
  const backRef = useRef<Mesh>(null);
  const leftRef = useRef<Mesh>(null);
  const rightRef = useRef<Mesh>(null);
  const roofRef = useRef<Mesh>(null);

  useFaceCulling([
    { ref: frontRef, center: [-thickness / 2, height / 2, width / 2], normal: [-1, 0, 0] },
    { ref: backRef, center: [length + thickness / 2, height / 2, width / 2], normal: [1, 0, 0] },
    { ref: leftRef, center: [length / 2, height / 2, -thickness / 2], normal: [0, 0, -1] },
    { ref: rightRef, center: [length / 2, height / 2, width + thickness / 2], normal: [0, 0, 1] },
    { ref: roofRef, center: [length / 2, height + thickness / 2, width / 2], normal: [0, 1, 0] },
  ]);

  const wallTexture = useMemo(() => {
    const texture = getCorrugatedTexture().clone();
    texture.needsUpdate = true;
    texture.repeat.set(Math.max(1, Math.round(length / 400)), Math.max(1, Math.round(height / 400)));
    return texture;
  }, [length, height]);

  const sideWallTexture = useMemo(() => {
    const texture = getCorrugatedTexture().clone();
    texture.needsUpdate = true;
    texture.repeat.set(Math.max(1, Math.round(width / 400)), Math.max(1, Math.round(height / 400)));
    return texture;
  }, [width, height]);

  const roofTexture = useMemo(() => {
    const texture = getCorrugatedTexture().clone();
    texture.needsUpdate = true;
    texture.repeat.set(Math.max(1, Math.round(length / 400)), Math.max(1, Math.round(width / 400)));
    return texture;
  }, [length, width]);

  const floorTexture = useMemo(() => {
    const texture = getFloorTexture().clone();
    texture.needsUpdate = true;
    texture.repeat.set(Math.max(1, Math.round(length / 300)), Math.max(1, Math.round(width / 300)));
    return texture;
  }, [length, width]);

  // Vô hiệu hóa raycast cho toàn bộ vỏ container (không phải mục tiêu click) để click chọn
  // hàng hóa phía sau/bên trong không bị các mặt vỏ chắn mất.
  const disableRaycast = () => null;
  const opaqueWallProps = { roughness: 0.6, metalness: 0.15 };

  return (
    <group>
      {/* Sàn — luôn hiện, không phụ thuộc góc camera */}
      <mesh position={[length / 2, -thickness / 2, width / 2]} receiveShadow raycast={disableRaycast}>
        <boxGeometry args={[length, thickness, width]} />
        <meshStandardMaterial map={floorTexture} roughness={0.95} metalness={0.05} />
        <Edges color={EDGE_COLOR} />
      </mesh>

      {/*
        4 vách + nóc nằm NGOÀI ranh giới không gian xếp hàng (0..length / 0..width / 0..height),
        không lấn vào trong — nếu vẽ lấn vào sẽ đè lên hàng đặt sát vách/nóc.
      */}

      {/* Vách cửa (trước), ngoài x=0 */}
      <mesh ref={frontRef} position={[-thickness / 2, height / 2, width / 2]} raycast={disableRaycast}>
        <boxGeometry args={[thickness, height, width]} />
        <meshStandardMaterial map={wallTexture} {...opaqueWallProps} />
        <Edges color={EDGE_COLOR} />
      </mesh>

      {/* Vách hậu (đối diện cửa), ngoài x=length */}
      <mesh ref={backRef} position={[length + thickness / 2, height / 2, width / 2]} raycast={disableRaycast}>
        <boxGeometry args={[thickness, height, width]} />
        <meshStandardMaterial map={wallTexture} {...opaqueWallProps} />
        <Edges color={EDGE_COLOR} />
      </mesh>

      {/* Vách trái, ngoài y=0 */}
      <mesh ref={leftRef} position={[length / 2, height / 2, -thickness / 2]} raycast={disableRaycast}>
        <boxGeometry args={[length, height, thickness]} />
        <meshStandardMaterial map={sideWallTexture} {...opaqueWallProps} />
        <Edges color={EDGE_COLOR} />
      </mesh>

      {/* Vách phải, ngoài y=width */}
      <mesh ref={rightRef} position={[length / 2, height / 2, width + thickness / 2]} raycast={disableRaycast}>
        <boxGeometry args={[length, height, thickness]} />
        <meshStandardMaterial map={sideWallTexture} {...opaqueWallProps} />
        <Edges color={EDGE_COLOR} />
      </mesh>

      {/* Nóc, ngoài z=height (trục dọc) */}
      <mesh ref={roofRef} position={[length / 2, height + thickness / 2, width / 2]} raycast={disableRaycast}>
        <boxGeometry args={[length, thickness, width]} />
        <meshStandardMaterial map={roofTexture} {...opaqueWallProps} />
        <Edges color={EDGE_COLOR} />
      </mesh>
    </group>
  );
}
