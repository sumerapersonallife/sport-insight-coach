import { describe, expect, it } from "bun:test";
import {
  canStartNextSession,
  homeworkAssignment,
  isSessionDurationHours,
  shouldSpeakCue,
} from "@/lib/session-rules";

describe("session and coaching rules", () => {
  it("allows only one through four hour sessions", () => {
    expect(isSessionDurationHours(1)).toBe(true);
    expect(isSessionDurationHours(4)).toBe(true);
    expect(isSessionDurationHours(0)).toBe(false);
    expect(isSessionDurationHours(5)).toBe(false);
  });

  it("does not repeat the same cue before four seconds", () => {
    expect(shouldSpeakCue("Stay balanced", "Stay balanced", 1_000, 4_999)).toBe(false);
    expect(shouldSpeakCue("Stay balanced", "Stay balanced", 1_000, 5_000)).toBe(true);
    expect(shouldSpeakCue("Stay balanced", "", 1_000, 1_100)).toBe(true);
  });

  it("requires submitted homework review before a follow-up session", () => {
    expect(canStartNextSession(null)).toBe(true);
    expect(canStartNextSession({ status: "awaiting-video" })).toBe(false);
    expect(canStartNextSession({ status: "submitted" })).toBe(false);
    expect(canStartNextSession({ status: "reviewed" })).toBe(true);
  });

  it("assigns sport-specific homework", () => {
    expect(homeworkAssignment("football", 0).title).toBe("First-touch and turn");
    expect(homeworkAssignment("tennis", 0).title).toBe("Split-step and recover");
  });
});