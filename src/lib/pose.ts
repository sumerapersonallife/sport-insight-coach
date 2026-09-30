// Browser-only pose tracking via MediaPipe. Import dynamically from effects/handlers.
import type { PoseLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";

let imageLm: Promise<PoseLandmarker> | null = null;
let videoLm: Promise<PoseLandmarker> | null = null;

async function create(mode: "IMAGE" | "VIDEO") {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
  );
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    },
    runningMode: mode,
    numPoses: 2,
  });
}

export function getLandmarker(mode: "IMAGE" | "VIDEO") {
  if (mode === "IMAGE") return (imageLm ??= create("IMAGE"));
  return (videoLm ??= create("VIDEO"));
}

export const CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24],
  [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32],
];

function angle(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark) {
  const r = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let d = Math.abs((r * 180) / Math.PI);
  if (d > 180) d = 360 - d;
  return Math.round(d);
}

export function poseSummary(lm: NormalizedLandmark[] | undefined) {
  if (!lm || lm.length < 29) return "";
  const trunkLean = Math.round(
    (Math.atan2(
      (lm[11].x + lm[12].x) / 2 - (lm[23].x + lm[24].x) / 2,
      (lm[23].y + lm[24].y) / 2 - (lm[11].y + lm[12].y) / 2,
    ) * 180) / Math.PI,
  );
  const vals = {
    leftElbow: angle(lm[11], lm[13], lm[15]),
    rightElbow: angle(lm[12], lm[14], lm[16]),
    leftKnee: angle(lm[23], lm[25], lm[27]),
    rightKnee: angle(lm[24], lm[26], lm[28]),
    leftHip: angle(lm[11], lm[23], lm[25]),
    rightHip: angle(lm[12], lm[24], lm[26]),
    leftShoulder: angle(lm[13], lm[11], lm[23]),
    rightShoulder: angle(lm[14], lm[12], lm[24]),
    trunkLean,
  };
  return Object.entries(vals).map(([k, v]) => `${k}=${v}`).join(", ");
}

export type Angles = { label: string; value: number }[];
export function poseAngles(lm: NormalizedLandmark[] | undefined): Angles {
  const s = poseSummary(lm);
  if (!s) return [];
  return s.split(", ").map((p) => {
    const [k, v] = p.split("=");
    return { label: k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()), value: Number(v) };
  });
}
