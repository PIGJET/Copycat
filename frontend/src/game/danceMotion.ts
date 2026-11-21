import type { PoseLandmark } from "../types/pose.ts";

const joints = [13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export function danceMotion(previous: PoseLandmark[], current: PoseLandmark[]) {
  let visibleJoints = 0;
  let movingJoints = 0;

  for (const index of joints) {
    const before = previous[index];
    const after = current[index];
    if (!before || !after || before.visibility < 0.6 || after.visibility < 0.6) continue;
    visibleJoints++;
    if (Math.hypot(after.x - before.x, after.y - before.y) >= 0.027) movingJoints++;
  }

  return visibleJoints >= 4 && movingJoints >= 2;
}
