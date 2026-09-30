import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Still Ballin — Train. Play. Grow." },
      { name: "description", content: "Still Ballin is your AI sports coach for football and tennis. Train, play, grow, and get started with your own footage." },
      { property: "og:title", content: "Still Ballin — Train. Play. Grow." },
      { property: "og:description", content: "Explore Still Ballin and start training with your AI football and tennis coach." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  return (
    <iframe
      title="Still Ballin welcome page"
      src="/welcome.html"
      className="block h-dvh w-full border-0"
    />
  );
}
