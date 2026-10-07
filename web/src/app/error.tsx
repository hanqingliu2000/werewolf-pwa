"use client";
import { RotateCcw } from "lucide-react";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="loading-page"><h1>连接暂时中断</h1><button className="button primary" onClick={reset}><RotateCcw aria-hidden />重试</button><a href="/" className="text-link">返回入口</a></main>;
}
