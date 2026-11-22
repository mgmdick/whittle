import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Where it hurts",
    short_name: "Where it hurts",
    description: "Tap where you're sore or pose a dummy to show what movement hurts.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4ece0",
    theme_color: "#f4ece0",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
