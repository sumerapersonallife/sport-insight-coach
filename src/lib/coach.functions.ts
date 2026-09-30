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
export type CoachResult = { summary: string; score: number; tips: CoachTip[] };

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

    const prompt = `You are "Still Ballin", an expert ${data.sport} coach.
Analyze the athlete in this image. Computer-vision data:
- Body pose (angles in degrees, from pose tracking): ${data.pose || "not detected"}
- Detected objects (person / ball / racket boxes, pixel coords): ${data.detections || "none"}
Give practical, encouraging coaching about body angle, posture, balance, technique and ${data.sport} tactics.
If no athlete is visible, say so in the summary and give general tips.
Return JSON: {"summary": string (1-2 sentences), "score": integer 1-10 form rating, "tips": [{"category": "Posture"|"Angle"|"Technique"|"Tactics"|"Balance", "title": short string, "tip": 1-2 sentences}] } with 4-6 tips.`;

    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { inline_data: { mime_type: "image/jpeg", data: data.image } },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      );
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
      const parsed = JSON.parse(text.replace(/^```json\s*|```$/g, "")) as CoachResult;
      return {
        result: {
          summary: String(parsed.summary ?? ""),
          score: Math.max(1, Math.min(10, Number(parsed.score) || 5)),
          tips: Array.isArray(parsed.tips) ? parsed.tips.slice(0, 8) : [],
        },
        error: null as string | null,
      };
    } catch (e) {
      console.error(e);
      return { result: null as CoachResult | null, error: "Couldn't read the coach's answer. Try again." };
    }
  });
