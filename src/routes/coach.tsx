import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
  Camera, Image as ImageIcon, Video, Loader2, Sparkles, Upload, Square, Target, Activity,
} from "lucide-react";
import logo from "@/assets/logo.png.asset.json";
import {
  detectObjects, getCoaching, type CoachResult, type Detection,
} from "@/lib/coach.functions";
import { CONNECTIONS, poseAngles, poseSummary, type Angles } from "@/lib/pose";

export const Route = createFileRoute("/coach")({
  head: () => ({
    meta: [
      { title: "Still Ballin — AI Football & Tennis Coach" },
      { name: "description", content: "Upload a photo, video or go live. Still Ballin tracks your pose, the players and the ball, then coaches you on angle, posture and tactics." },
      { property: "og:title", content: "Still Ballin — AI Football & Tennis Coach" },
      { property: "og:description", content: "Pose, player and ball tracking with instant AI coaching tips for football and tennis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Sport = "football" | "tennis";
type Source = "photo" | "video" | "camera";
type Media = HTMLImageElement | HTMLVideoElement;

function captureFrame(media: Media) {
  const w = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const h = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, 640 / w);
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext("2d")!.drawImage(media, 0, 0, c.width, c.height);
  return { image: c.toDataURL("image/jpeg", 0.8).split(",")[1], scale };
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "orange";
}

function Index() {
  const [sport, setSport] = useState<Sport>("football");
  const [source, setSource] = useState<Source>("photo");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [angles, setAngles] = useState<Angles>([]);
  const [counts, setCounts] = useState({ players: 0, balls: 0, rackets: 0 });
  const [coach, setCoach] = useState<CoachResult | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coaching, setCoaching] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poseRef = useRef<NormalizedLandmark[][]>([]);
  const detRef = useRef<{ list: Detection[]; scale: number }>({ list: [], scale: 1 });
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const detBusy = useRef(false);
  const lastDet = useRef(0);
  const rafRef = useRef<number | null>(null);

  const detectFn = useServerFn(detectObjects);
  const coachFn = useServerFn(getCoaching);

  const currentMedia = useCallback((): Media | null => {
    return source === "photo" ? imgRef.current : videoRef.current;
  }, [source]);

  const draw = useCallback(() => {
    const media = currentMedia();
    const canvas = canvasRef.current;
    if (!media || !canvas) return;
    const w = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
    const h = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
    if (!w || !h) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    const primary = cssVar("--primary");
    const accent = cssVar("--accent");
    const chart = cssVar("--chart-3");
    const lw = Math.max(2, w / 300);

    const { list, scale } = detRef.current;
    ctx.font = `${Math.max(12, w / 60)}px Barlow, sans-serif`;
    for (const d of list) {
      const x = (d.x - d.width / 2) / scale, y = (d.y - d.height / 2) / scale;
      const bw = d.width / scale, bh = d.height / scale;
      ctx.strokeStyle = d.class === "person" ? chart : accent;
      ctx.lineWidth = lw;
      if (d.class === "sports ball") {
        ctx.beginPath();
        ctx.arc(d.x / scale, d.y / scale, Math.max(bw, bh) / 2 + lw * 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(x, y, bw, bh);
      }
      const label = `${d.class === "sports ball" ? "ball" : d.class === "tennis racket" ? "racket" : "player"} ${Math.round(d.confidence * 100)}%`;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(label, x, Math.max(14, y - 6));
    }

    const trail = trailRef.current;
    if (trail.length > 1) {
      ctx.strokeStyle = accent;
      ctx.setLineDash([lw * 3, lw * 2]);
      ctx.beginPath();
      trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const lm of poseRef.current) {
      ctx.strokeStyle = primary;
      ctx.lineWidth = lw * 1.5;
      for (const [a, b] of CONNECTIONS) {
        if (!lm[a] || !lm[b]) continue;
        ctx.beginPath();
        ctx.moveTo(lm[a].x * w, lm[a].y * h);
        ctx.lineTo(lm[b].x * w, lm[b].y * h);
        ctx.stroke();
      }
      ctx.fillStyle = accent;
      for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
        if (!lm[i]) continue;
        ctx.beginPath();
        ctx.arc(lm[i].x * w, lm[i].y * h, lw * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [currentMedia]);

  const runDetection = useCallback(async (media: Media) => {
    if (detBusy.current) return;
    const frame = captureFrame(media);
    if (!frame) return;
    detBusy.current = true;
    try {
      const res = await detectFn({ data: { image: frame.image } });
      if (res.error) setStatus(res.error);
      detRef.current = { list: res.detections, scale: frame.scale };
      const ball = res.detections
        .filter((d) => d.class === "sports ball")
        .sort((a, b) => b.confidence - a.confidence)[0];
      if (ball) {
        trailRef.current = [...trailRef.current, { x: ball.x / frame.scale, y: ball.y / frame.scale }].slice(-20);
      }
      setCounts({
        players: res.detections.filter((d) => d.class === "person").length,
        balls: res.detections.filter((d) => d.class === "sports ball").length,
        rackets: res.detections.filter((d) => d.class === "tennis racket").length,
      });
    } catch (e) {
      console.error(e);
      setStatus("Tracking hiccup — retrying");
    } finally {
      detBusy.current = false;
    }
  }, [detectFn]);

  const resetTracking = () => {
    poseRef.current = [];
    detRef.current = { list: [], scale: 1 };
    trailRef.current = [];
    setAngles([]);
    setCounts({ players: 0, balls: 0, rackets: 0 });
    setCoach(null);
    setCoachError(null);
  };

  // Photo analysis
  const analyzePhoto = useCallback(async () => {
    const img = imgRef.current;
    if (!img) return;
    setStatus("Tracking pose, players and ball…");
    try {
      const { getLandmarker } = await import("@/lib/pose");
      const lm = await getLandmarker("IMAGE");
      const r = lm.detect(img);
      poseRef.current = r.landmarks;
      setAngles(poseAngles(r.landmarks[0]));
    } catch (e) {
      console.error(e);
      setStatus("Pose tracking couldn't load");
    }
    await runDetection(img);
    draw();
    setStatus("Tracking done — tap Get coaching tips");
  }, [draw, runDetection]);

  // Video/camera loop
  const stopLoop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const startLoop = useCallback(async () => {
    stopLoop();
    let landmarker: Awaited<ReturnType<typeof import("@/lib/pose").getLandmarker>> | null = null;
    try {
      const { getLandmarker } = await import("@/lib/pose");
      landmarker = await getLandmarker("VIDEO");
    } catch (e) {
      console.error(e);
      setStatus("Pose tracking couldn't load");
    }
    let lastTs = -1;
    let lastAngles = 0;
    const tick = () => {
      const v = videoRef.current;
      if (!v) return;
      if (v.readyState >= 2 && v.videoWidth) {
        const now = performance.now();
        if (landmarker && now > lastTs) {
          lastTs = now;
          try {
            const r = landmarker.detectForVideo(v, now);
            poseRef.current = r.landmarks;
            if (now - lastAngles > 500) {
              lastAngles = now;
              setAngles(poseAngles(r.landmarks[0]));
            }
          } catch {
            /* skip frame */
          }
        }
        if (!v.paused && now - lastDet.current > 900) {
          lastDet.current = now;
          void runDetection(v);
        }
        draw();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    setStatus("Live tracking on");
  }, [draw, runDetection]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  };

  useEffect(() => () => { stopLoop(); stopCamera(); }, []);

  const switchSource = (s: Source) => {
    stopLoop();
    stopCamera();
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    setMediaUrl(null);
    resetTracking();
    setStatus("");
    setSource(s);
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    if ((source === "photo" && isVideo) || (source === "video" && !isVideo)) {
      setStatus(`Please choose a ${source} file`);
      return;
    }
    stopLoop();
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    resetTracking();
    setMediaUrl(URL.createObjectURL(file));
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      resetTracking();
      setCameraOn(true);
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      void startLoop();
    } catch (e) {
      console.error(e);
      setStatus("Camera access was blocked or isn't available");
    }
  };

  const askCoach = async () => {
    const media = currentMedia();
    if (!media) return;
    const frame = captureFrame(media);
    if (!frame) {
      setCoachError("Load a photo or video first");
      return;
    }
    setCoaching(true);
    setCoachError(null);
    try {
      const dets = detRef.current.list
        .map((d) => `${d.class}@(${Math.round(d.x)},${Math.round(d.y)}) ${Math.round(d.width)}x${Math.round(d.height)}`)
        .join("; ");
      const res = await coachFn({
        data: { image: frame.image, sport, pose: poseSummary(poseRef.current[0]), detections: dets },
      });
      if (res.error || !res.result) setCoachError(res.error ?? "No answer from the coach");
      else setCoach(res.result);
    } catch (e) {
      console.error(e);
      setCoachError("Couldn't reach the coach. Try again.");
    } finally {
      setCoaching(false);
    }
  };

  const hasMedia = source === "camera" ? cameraOn : !!mediaUrl;

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-5">
        <img src={logo.url} alt="Still Ballin logo" className="h-14 w-14 rounded-full object-cover" />
        <div>
          <h1 className="font-display text-3xl leading-none tracking-wide">Still Ballin</h1>
          <p className="text-sm text-muted-foreground">Your AI sports coach</p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-16">
        <section className="py-6 text-center md:py-10">
          <h2 className="font-display text-5xl tracking-wide md:text-7xl">
            Train smarter. <span className="text-brand-gradient">Keep ballin.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Upload a photo, a video or go live. We track your body, the players and the ball — then coach you on angle, posture and tactics.
          </p>
        </section>

        <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
          <div className="flex rounded-full bg-secondary p-1">
            {(["football", "tennis"] as Sport[]).map((s) => (
              <button
                key={s}
                onClick={() => setSport(s)}
                className={`rounded-full px-5 py-2 text-sm font-semibold capitalize transition ${sport === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {s === "football" ? "⚽ Football" : "🎾 Tennis"}
              </button>
            ))}
          </div>
          <div className="flex rounded-full bg-secondary p-1">
            {([
              ["photo", "Photo", ImageIcon],
              ["video", "Video", Video],
              ["camera", "Live camera", Camera],
            ] as const).map(([s, label, Icon]) => (
              <button
                key={s}
                onClick={() => switchSource(s)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${source === s ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="self-start rounded-2xl border bg-card p-4 shadow-glow">
            <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-xl bg-muted">
              {!hasMedia && source !== "camera" && (
                <label className="flex cursor-pointer flex-col items-center gap-3 p-10 text-center text-muted-foreground">
                  <Upload className="h-10 w-10 text-primary" />
                  <span className="font-semibold text-foreground">Upload a {source}</span>
                  <span className="text-sm">Full body in frame works best</span>
                  <input
                    type="file"
                    accept={source === "photo" ? "image/*" : "video/*"}
                    className="hidden"
                    onChange={(e) => onFile(e.target.files?.[0])}
                  />
                </label>
              )}
              {source === "camera" && !cameraOn && (
                <button onClick={startCamera} className="flex flex-col items-center gap-3 p-10 text-muted-foreground">
                  <Camera className="h-10 w-10 text-primary" />
                  <span className="font-semibold text-foreground">Start live camera</span>
                </button>
              )}

              {source === "photo" && mediaUrl && (
                <div className="relative w-full">
                  <img ref={imgRef} src={mediaUrl} alt="Your upload" className="block w-full" onLoad={analyzePhoto} />
                  <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
                </div>
              )}
              {source !== "photo" && (
                <div className={`relative w-full ${hasMedia ? "" : "hidden"}`}>
                  <video
                    key={source === "video" ? mediaUrl ?? "empty" : "camera"}
                    ref={videoRef}
                    src={source === "video" ? mediaUrl ?? undefined : undefined}
                    className="block w-full"
                    playsInline
                    muted
                    loop={source === "video"}
                    autoPlay={source === "video"}
                    controls={source === "video"}
                    onLoadedData={(e) => {
                      if (source !== "video") return;
                      void startLoop();
                      void runDetection(e.currentTarget);
                      e.currentTarget.play().catch(() => {});
                    }}
                    onSeeked={(e) => source === "video" && void runDetection(e.currentTarget)}
                    onPause={(e) => source === "video" && void runDetection(e.currentTarget)}
                    onError={() => source === "video" && setStatus("This video format can't play in your browser — try an MP4 (H.264) file")}
                  />
                  <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={askCoach}
                disabled={!hasMedia || coaching}
                className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                {coaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {coaching ? "Coach is watching…" : "Get coaching tips"}
              </button>
              {source === "camera" && cameraOn && (
                <button onClick={() => { stopLoop(); stopCamera(); }} className="flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold">
                  <Square className="h-4 w-4" /> Stop camera
                </button>
              )}
              {source !== "camera" && mediaUrl && (
                <label className="cursor-pointer rounded-full border px-5 py-3 text-sm font-semibold">
                  Change {source}
                  <input type="file" accept={source === "photo" ? "image/*" : "video/*"} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                </label>
              )}
              {status && <span className="text-sm text-muted-foreground">{status}</span>}
            </div>
            {source === "video" && mediaUrl && (
              <p className="mt-2 text-xs text-muted-foreground">Tip: pause on the key moment, then get coaching tips for that frame.</p>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 font-display text-2xl tracking-wide">
                <Target className="h-5 w-5 text-accent" /> Tracking
              </h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Players", counts.players],
                  ["Ball", counts.balls],
                  [sport === "tennis" ? "Racket" : "Poses", sport === "tennis" ? counts.rackets : angles.length ? 1 : 0],
                ].map(([l, v]) => (
                  <div key={l as string} className="rounded-xl bg-secondary p-3">
                    <div className="font-display text-3xl text-primary">{v}</div>
                    <div className="text-xs text-muted-foreground">{l}</div>
                  </div>
                ))}
              </div>
              {angles.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {angles.map((a) => (
                    <div key={a.label} className="flex justify-between border-b py-1">
                      <span className="text-muted-foreground">{a.label}</span>
                      <span className="font-semibold">{a.value}°</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">Body angles appear here once a player is tracked.</p>
              )}
            </div>

            <div className="rounded-2xl border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 font-display text-2xl tracking-wide">
                <Activity className="h-5 w-5 text-primary" /> Coach says
              </h3>
              {coachError && <p className="rounded-lg bg-destructive/15 p-3 text-sm text-destructive">{coachError}</p>}
              {!coach && !coachError && (
                <p className="text-sm text-muted-foreground">Press <b>Get coaching tips</b> for feedback on your angle, posture and {sport} tactics.</p>
              )}
              {coach && (
                <div className="space-y-5" aria-live="polite">
                  <div className="flex items-start gap-4">
                    {coach.score !== null && (
                      <div className="shrink-0 border-r border-border pr-4">
                        <div className="font-display text-4xl text-primary">{coach.score}/10</div>
                        <div className="text-xs text-muted-foreground">Form</div>
                      </div>
                    )}
                    <p className="text-sm leading-relaxed text-foreground">{coach.summary}</p>
                  </div>
                  {coach.tips[0] && (
                    <div className="border-l-4 border-primary bg-primary/10 px-4 py-4">
                      <p className="mb-2 text-xs font-bold uppercase text-primary">Start here · {coach.tips[0].category}</p>
                      <h4 className="text-lg font-bold leading-tight text-foreground">{coach.tips[0].title}</h4>
                      <p className="mt-2 text-sm leading-relaxed text-foreground">{coach.tips[0].tip}</p>
                    </div>
                  )}
                  {coach.tips.length > 1 && (
                    <div>
                      <h4 className="mb-2 text-xs font-bold uppercase text-muted-foreground">Next adjustments</h4>
                      <div className="divide-y divide-border">
                        {coach.tips.slice(1).map((t, i) => (
                          <div key={i} className="py-3 first:pt-0">
                            <p className="text-xs font-semibold text-accent">{t.category}</p>
                            <p className="mt-1 font-semibold text-foreground">{t.title}</p>
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.tip}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
