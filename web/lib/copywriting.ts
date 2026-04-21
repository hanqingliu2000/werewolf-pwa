import fs from 'node:fs';
import path from 'node:path';

export type Tone = 'neutral' | 'immersive';

type Pack = {
  neutral: Record<string, Record<string, string>>;
  immersive: Record<string, Record<string, string>>;
};

export function getCopyPack(): Pack {
  const candidates = [
    path.resolve(process.cwd(), 'projects/werewolf-pwa/assets/docs/copywriting-zh-CN.json'),
    path.resolve(process.cwd(), '../assets/docs/copywriting-zh-CN.json'),
    path.resolve(process.cwd(), 'assets/docs/copywriting-zh-CN.json'),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) {
    throw new Error('copywriting pack not found');
  }
  const raw = fs.readFileSync(file, 'utf-8');
  return JSON.parse(raw);
}

export function getLine(pack: Pack, tone: Tone, section: string, key: string): string {
  return pack[tone]?.[section]?.[key] ?? '';
}
