import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Velfrok | Better living",
  description: "Useful everyday essentials, selected to make your routine feel a little easier.",
  metadataBase: new URL("https://velfrok.example"),
  openGraph: {
    title: "Velfrok | Better living",
    description: "Useful everyday essentials, selected to make your routine feel a little easier.",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
