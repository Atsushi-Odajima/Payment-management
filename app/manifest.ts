import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wire Pay — 決済管理ダッシュボード",
    short_name: "Wire Pay",
    description:
      "小規模ECストア向けの決済プロバイダ統合ダッシュボード。",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#2667e6",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
