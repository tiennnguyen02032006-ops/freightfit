type Dimensions = [number, number, number];

export function isOrientationAllowed(
  orientation: Dimensions,
  allowedOrientations: Dimensions[],
): boolean {
  return allowedOrientations.some(
    ([l, w, h]) => l === orientation[0] && w === orientation[1] && h === orientation[2],
  );
}
