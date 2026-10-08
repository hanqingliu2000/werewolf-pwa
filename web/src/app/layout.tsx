import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "狼人杀", description: "狼人杀线下对局", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#161819" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{process.env.WEREWOLF_MAINTENANCE === "1"
    ? <main className="loading-page"><h1>狼人杀</h1><p role="status">部署准备中，暂未开放入席。</p></main>
    : children}</body></html>;
}
