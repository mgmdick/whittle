import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Whittle — where it hurts",
    short_name: "Whittle",
    description: "Show where it hurts on a wooden mannequin, learn the muscles involved and what it could be.",
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
