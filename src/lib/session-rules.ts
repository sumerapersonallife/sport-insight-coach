export type Sport = "football" | "tennis";
export const SESSION_DURATION_HOURS = [1, 2, 3, 4] as const;
export type SessionDurationHours = (typeof SESSION_DURATION_HOURS)[number];

export type HomeworkStatus = "awaiting-video" | "submitted" | "reviewed";

export const CUE_REPEAT_COOLDOWN_MS = 4_000;

export function isSessionDurationHours(value: number): value is SessionDurationHours {
  return SESSION_DURATION_HOURS.some((hours) => hours === value);
}

export function canStartNextSession(homework: { status: HomeworkStatus } | null) {
  return homework === null || homework.status === "reviewed";
}

export function shouldSpeakCue(
  cue: string,
  previousCue: string,
  previousSpokenAt: number,
  now: number,
) {
  const normalizedCue = cue.trim();
  if (!normalizedCue) return false;
  return normalizedCue !== previousCue || now - previousSpokenAt >= CUE_REPEAT_COOLDOWN_MS;
}

const HOMEWORK_BY_SPORT: Record<Sport, { title: string; instruction: string }[]> = {
  football: [
    {
      title: "First-touch and turn",
      instruction: "Record five reps: receive the ball, take your first touch into space, then turn away from pressure.",
    },
    {
      title: "Change of direction",
      instruction: "Record six controlled dribbles, alternating a change of direction with each rep.",
    },
    {
      title: "Passing and move",
      instruction: "Record five passes against a wall or partner, then move into a new space before the return.",
    },
  ],
  tennis: [
    {
      title: "Split-step and recover",
      instruction: "Record six shadow reps: split-step, move to a side, recover to the middle, and reset.",
    },
    {
      title: "Forehand footwork",
      instruction: "Record five shadow forehands, setting your feet before each swing and recovering after it.",
    },
    {
      title: "Serve setup",
      instruction: "Record five serve-preparation reps, focusing on a steady toss setup and balanced finish.",
    },
  ],
};

export function homeworkAssignment(sport: Sport, completedSessions: number) {
  const tasks = HOMEWORK_BY_SPORT[sport];
  const index = Math.abs(completedSessions) % tasks.length;
  return tasks[index] ?? tasks[0] ?? { title: "Practice reps", instruction: "Record a short set of focused practice reps." };
}