import { Line } from '@react-three/drei';

interface HeightLimitLineProps {
  length: number;
  width: number;
  limit: number; // mm tính từ sàn — vạch giới hạn chiều cao xếp của container lạnh
}

/** Vạch đỏ giới hạn chiều cao xếp (container lạnh) chạy quanh bốn vách; hàng không được vượt vạch. */
export function HeightLimitLine({ length, width, limit }: HeightLimitLineProps) {
  const points: Array<[number, number, number]> = [
    [0, limit, 0],
    [length, limit, 0],
    [length, limit, width],
    [0, limit, width],
    [0, limit, 0],
  ];
  return <Line points={points} color="#d92d20" lineWidth={2} dashed dashSize={120} gapSize={80} raycast={() => null} />;
}
