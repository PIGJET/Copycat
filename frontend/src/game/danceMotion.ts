import type { PoseLandmark } from "../types/pose.ts";

const joints = [13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const jitterFloor = 0.004;

/** Motion from the two most active visible joints, with small tracking jitter removed. */
export function danceMotion(previous: PoseLandmark[], current: PoseLandmark[]) {
  let visibleJoints = 0;
  let fastest = 0;
  let secondFastest = 0;

  for (const index of joints) {
    const before = previous[index];
    const after = current[index];
    if (!before || !after || before.visibility < 0.6 || after.visibility < 0.6) continue;
    visibleJoints++;
    const distance = Math.hypot(after.x - before.x, after.y - before.y);
    if (distance > fastest) {
      secondFastest = fastest;
      fastest = distance;
    } else if (distance > secondFastest) {
      secondFastest = distance;
    }
  }

  if (visibleJoints < 4 || secondFastest < jitterFloor) return 0;
  return Math.max(0, secondFastest - jitterFloor)
    + Math.min(0.012, (fastest - secondFastest) * 0.25);
}
