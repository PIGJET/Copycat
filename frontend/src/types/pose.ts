
export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrame {
  t: number; // ms since recording started (CONTRACT.md)
  landmarks: PoseLandmark[];
}

export interface PoseSequence {
  playerId: string;
  duration: number;
  frames: PoseFrame[];
}
