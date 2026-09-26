import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rainline — Precipitation Forecast",
    short_name: "Rainline",
    description: "Know when the rain is coming.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#081521",
    theme_color: "#081521",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
