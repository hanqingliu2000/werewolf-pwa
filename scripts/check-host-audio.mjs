import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('web/public/audio/host');
const required = [
  'night_guard_open.mp3',
  'night_guard_close.mp3',
  'night_werewolf_open.mp3',
  'night_werewolf_close.mp3',
  'night_seer_open.mp3',
  'night_seer_close.mp3',
  'night_witch_open.mp3',
  'night_witch_close.mp3',
  'night_resolve.mp3',
  'day_announce.mp3',
  'day_input.mp3',
];

let ok = true;
for (const f of required) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) {
    console.log(`MISSING ${f}`);
    ok = false;
    continue;
  }
  const size = fs.statSync(p).size;
  if (size <= 0) {
    console.log(`EMPTY ${f}`);
    ok = false;
  } else {
    console.log(`OK ${f} (${size} bytes)`);
  }
}

if (!ok) process.exit(1);
console.log('All host audio assets are present and non-empty.');
