import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AduPay",
    short_name: "AduPay",
    description: "Votre argent, votre communauté. Tontines, Payer pour et épargne.",
    lang: "fr",
    start_url: "/accueil",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAF7F2",
    theme_color: "#1F2A5A",
    categories: ["finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
