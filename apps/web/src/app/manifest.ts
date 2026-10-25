import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Coppergate",
    short_name: "Coppergate",
    description:
      "Autonomy under contract. Only what’s on the program ships. Open Program Runtime with Spend License and Ship Receipt.",
    start_url: "/",
    display: "standalone",
    background_color: "#090a0c",
    theme_color: "#090a0c",
    lang: "en",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
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
