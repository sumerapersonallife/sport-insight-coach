import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const requestSchema = z.object({ text: z.string().trim().min(1).max(500) });
const VOICE_MODEL_ID = "93681dcf385a40b888f8fe6d14f584db";

export const Route = createFileRoute("/api/public/coach-voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (!origin || origin !== new URL(request.url).origin) {
          return Response.json({ error: "Request origin rejected" }, { status: 403 });
        }

        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > 8_192) {
          return Response.json({ error: "Request is too large" }, { status: 413 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid request body" }, { status: 400 });
        }

        const parsed = requestSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Text must be between 1 and 500 characters" }, { status: 400 });
        }

        const apiKey = process.env["FISH_AUDIO_API_KEY"];
        if (!apiKey) {
          return Response.json({ error: "Voice service is not configured" }, { status: 503 });
        }

        try {
          const upstream = await fetch("https://api.fish.audio/v1/tts", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              model: "s2.1-pro",
            },
            body: JSON.stringify({
              text: parsed.data.text,
              reference_id: VOICE_MODEL_ID,
              format: "mp3",
              latency: "balanced",
            }),
          });

          if (!upstream.ok || !upstream.body) {
            return Response.json({ error: "Voice generation failed" }, { status: 502 });
          }

          return new Response(upstream.body, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          return Response.json({ error: "Voice service is unavailable" }, { status: 502 });
        }
      },
    },
  },
});