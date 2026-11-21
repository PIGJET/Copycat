
export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrame {
  timestamp: number;
  landmarks: PoseLandmark[];
}

export interface PoseSequence {
  playerId: string;
  duration: number;
  frames: PoseFrame[];
}
