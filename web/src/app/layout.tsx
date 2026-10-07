import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "狼人杀", description: "狼人杀线下对局", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#161819" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
