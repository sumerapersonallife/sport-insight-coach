import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const sportSchema = z.enum(["football", "tennis"]);
const imageSchema = z.string().min(100).max(4_000_000); // base64 jpeg, no data: prefix

export type Detection = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
};

const RELEVANT = new Set(["person", "sports ball", "tennis racket"]);

export const detectObjects = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ image: imageSchema }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env["ROBOFLOW_API_KEY"];
    if (!key) return { detections: [] as Detection[], error: "Detection key missing" };
    try {
      const res = await fetch(
        `https://serverless.roboflow.com/coco/3?api_key=${key}&confidence=30`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: data.image,
        },
      );
      if (!res.ok) {
        console.error("Roboflow error", res.status, await res.text());
        return { detections: [] as Detection[], error: `Detection failed (${res.status})` };
      }
      const json = (await res.json()) as { predictions?: Detection[] };
      const detections = (json.predictions ?? [])
        .filter((p) => RELEVANT.has(p.class))
        .map((p) => ({
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
          confidence: p.confidence,
          class: p.class,
        }));
      return { detections, error: null as string | null };
    } catch (e) {
      console.error(e);
      return { detections: [] as Detection[], error: "Detection service unavailable" };
    }
  });

export type CoachTip = { category: string; title: string; tip: string };
export type CoachResult = { summary: string; score: number | null; tips: CoachTip[] };

export const getCoaching = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        image: imageSchema,
        sport: sportSchema,
        pose: z.string().max(4000),
        detections: z.string().max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env["GEMINI_API_KEY"];
    if (!key) return { result: null as CoachResult | null, error: "Coach key missing" };

    const prompt = `You are Still Ballin, a perceptive, supportive real-life ${data.sport} coach talking directly to the player after seeing ONE frame. Speak naturally, like a coach on the sideline, not a report or a generic chatbot.
Visual evidence (can be incomplete or inaccurate):
- Body pose / measured angles: ${data.pose || "not detected"}
- Object detections (pixel coordinates): ${data.detections || "none"}

Look at the image yourself. Start the summary with one specific thing the athlete is doing well, if visible, then name the most useful improvement. If you cannot see an athlete clearly, say what is missing and do not pretend to assess their form.
Give exactly 3 short tips, ordered by importance. The FIRST tip is the single highest-impact correction to try on the next rep. For each tip, use a punchy, conversational title and a tip that connects what you can actually see to one clear physical action or tactical decision and why it helps. Keep the instructions easy to try, encouraging, and specific to ${data.sport}. Do not prescribe an exact angle unless it is reliably measured and meaningful. Do not claim to see a swing, shot trajectory, ball movement, opponent decision, or before/after change from a still frame. For videos and live camera this is also just one captured frame. If visibility is limited, say so and offer a conditional coaching cue instead of inventing observations. Avoid repetitive advice, filler, made-up numbers, or false certainty.
Only give a 1-10 form score when the athlete and relevant posture are clearly visible; otherwise use null. If no athlete is clearly visible, give at most 2 general, conditional tips rather than personalized corrections.
Return only JSON: {"summary": string, "score": number|null, "tips": [{"category": "Posture"|"Angle"|"Technique"|"Tactics"|"Balance", "title": string, "tip": string}]}.`;

    try {
      const body = JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: "image/jpeg", data: data.image } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      });
      const models = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.7-flash", "gemini-flash-lite-latest"];
      let res!: Response;
      for (const model of models) {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body,
          },
        );
        if (res.ok || res.status === 401 || res.status === 403) break;
      }
      if (!res.ok) {
        console.error("Gemini coaching request failed", res.status);
        const msg =
          res.status === 401 || res.status === 403
            ? "The saved Gemini key was rejected. Add a valid Gemini API key to restore coaching tips."
            : res.status === 429
            ? "The coach is busy right now — try again in a moment."
            : `Coach request failed (${res.status})`;
        return { result: null as CoachResult | null, error: msg };
      }
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const parsed = z.object({
        summary: z.string(),
        score: z.number().nullable().optional(),
        tips: z.array(z.object({ category: z.string(), title: z.string(), tip: z.string() })),
      }).parse(JSON.parse(text.replace(/^```json\s*|```$/g, "")));
      return {
        result: {
          summary: parsed.summary,
          score: parsed.score == null ? null : Math.max(1, Math.min(10, Math.round(parsed.score))),
          tips: parsed.tips.slice(0, 3),
        },
        error: null as string | null,
      };
    } catch (e) {
      console.error(e);
      return { result: null as CoachResult | null, error: "Couldn't read the coach's answer. Try again." };
    }
  });
