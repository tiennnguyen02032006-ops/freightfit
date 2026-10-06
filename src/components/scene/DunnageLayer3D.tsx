import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { InstancedMesh, Object3D, Vector3 } from 'three';
import type { DunnageGap } from '../../domain/types';
import { bagTransform, createPillowGeometry, describeDunnageGap, type InstanceTransform } from './dunnageView';

interface DunnageLayer3DProps {
  // Khe đã tính sẵn (ContainerScene tính 1 lần, dùng chung cho hàng số liệu/bảng bên phải/lớp 3D).
  gaps: DunnageGap[];
}

interface TaggedTransform extends InstanceTransform {
  gapId: string;
}

function applyTransforms(mesh: InstancedMesh, items: InstanceTransform[]) {
  const dummy = new Object3D();
  items.forEach((item, i) => {
    dummy.position.set(...item.position);
    dummy.rotation.set(...item.rotation);
    dummy.scale.set(...item.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/**
 * Lớp "Chèn lót" trong khung 3D: mỗi khe nhỏ hiển thị các túi khí (khối trắng hơi trong suốt, bo góc, phình
 * nhẹ ở giữa, lấp vừa khít khe) — khe giữa hai cột pallet mỗi hàng pallet 1 túi. Rê chuột hoặc bấm vào 1 khe
 * để xem kích thước khe và số túi cần dùng.
 *
 * Hiệu năng: toàn bộ túi khí là 1 InstancedMesh (1 geometry chung, mỗi túi 1 ma trận) — 1 draw call bất kể
 * số khe. Danh sách khe chỉ tính lại khi placements
 * hoặc container đổi (useMemo). Chỉ là lớp hiển thị, không ảnh hưởng xếp hàng.
 */
export function DunnageLayer3D({ gaps }: DunnageLayer3DProps) {
  const gapsById = useMemo(() => new Map(gaps.map((g) => [g.id, g] as const)), [gaps]);

  const bags = useMemo<TaggedTransform[]>(
    () => gaps.flatMap((g) => g.bags.map((b) => ({ gapId: g.id, ...bagTransform(b, g.axis) }))),
    [gaps],
  );

  const pillow = useMemo(() => createPillowGeometry(), []);
  useEffect(() => () => pillow.dispose(), [pillow]);

  const bagMesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (bagMesh.current && bags.length > 0) applyTransforms(bagMesh.current, bags);
  }, [bags]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = hoveredId ?? selectedId;
  const active = activeId ? gapsById.get(activeId) : undefined;

  const pick = (items: TaggedTransform[], event: ThreeEvent<PointerEvent | MouseEvent>) =>
    event.instanceId === undefined ? null : (items[event.instanceId]?.gapId ?? null);

  const handlers = (items: TaggedTransform[]) => ({
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setHoveredId(pick(items, event));
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      setHoveredId(null);
      document.body.style.cursor = '';
    },
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      const id = pick(items, event);
      setSelectedId((prev) => (prev === id ? null : id));
    },
  });

  // gỡ con trỏ tay nếu lớp bị tắt/đổi container khi đang rê chuột
  useEffect(() => () => {
    document.body.style.cursor = '';
  }, []);

  if (gaps.length === 0) return null;

  const tooltipPosition = active
    ? new Vector3(active.x + active.length / 2, active.z + active.height / 2, active.y + active.width / 2)
    : null;

  return (
    <group>
      {bags.length > 0 && (
        <instancedMesh
          key={`bags-${bags.length}`}
          ref={bagMesh}
          args={[pillow, undefined, bags.length]}
          {...handlers(bags)}
        >
          <meshStandardMaterial color="#f5f8fc" roughness={0.35} metalness={0} transparent opacity={0.72} depthWrite={false} />
        </instancedMesh>
      )}
      {active && tooltipPosition && (
        <Html position={tooltipPosition} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
          <div className="dunnage-tooltip">
            <strong>{active.source === 'CENTER' ? 'Túi khí khe giữa hai cột pallet' : 'Chèn túi khí'}</strong>
            {describeDunnageGap(active).map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </Html>
      )}
    </group>
  );
}

