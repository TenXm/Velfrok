import type { MetadataRoute } from "next";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://velfrok.vercel.app").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/admin/", "/api/", "/checkout", "/checkout/", "/my-orders", "/my-orders/", "/payment/", "/login", "/login/"],
    },
    sitemap: siteUrl + "/sitemap.xml",
    host: siteUrl,
  };
}