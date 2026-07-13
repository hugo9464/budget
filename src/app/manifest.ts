import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mon budget",
    short_name: "Budget",
    description: "Votre budget personnel, simplement.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f3ee",
    theme_color: "#171a1f",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
