import './globals.css';
import type { ReactNode } from 'react';
import { ServiceWorkerRegister } from './service-worker-register';

export const metadata = {
  title: 'Werewolf Host PWA',
  description: '线下狼人杀主持工具',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
