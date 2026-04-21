export type HostTtsMode = 'browser' | 'prebuilt';

// 隐私护栏：严禁把私密查验结果播报为公共语音。
const privateNarrationPattern = /(查验结果|属于好人阵营|属于狼人阵营)/;

function assertPublicNarration(text: string) {
  if (privateNarrationPattern.test(text)) {
    throw new Error('PRIVATE_NARRATION_BLOCKED');
  }
}

export type NarrationClip = { key: string; text: string };

export const narrationCatalog: Record<string, NarrationClip> = {
  NIGHT_GUARD_OPEN: { key: 'night_guard_open', text: '守卫请睁眼，请选择你要守护的玩家。' },
  NIGHT_GUARD_CLOSE: { key: 'night_guard_close', text: '守卫请闭眼。' },
  NIGHT_WEREWOLF_OPEN: { key: 'night_werewolf_open', text: '狼人请睁眼，请选择你们今晚的目标。' },
  NIGHT_WEREWOLF_CLOSE: { key: 'night_werewolf_close', text: '狼人请闭眼。' },
  NIGHT_SEER_OPEN: { key: 'night_seer_open', text: '预言家请睁眼，请查验一名玩家。' },
  NIGHT_SEER_CLOSE: { key: 'night_seer_close', text: '预言家请闭眼。' },
  NIGHT_WITCH_OPEN: { key: 'night_witch_open', text: '女巫请睁眼，请决定是否使用药剂。' },
  NIGHT_WITCH_CLOSE: { key: 'night_witch_close', text: '女巫请闭眼。' },
  NIGHT_RESOLVE: { key: 'night_resolve', text: '夜晚操作结束，准备天亮。' },
  DAY_ANNOUNCE: { key: 'day_announce', text: '天亮了，请所有玩家睁眼。' },
  DAY_INPUT: { key: 'day_input', text: '请房主录入白天投票结果。' },
};

const phaseOpenKey: Record<string, keyof typeof narrationCatalog> = {
  NIGHT_GUARD: 'NIGHT_GUARD_OPEN',
  NIGHT_WEREWOLF: 'NIGHT_WEREWOLF_OPEN',
  NIGHT_SEER: 'NIGHT_SEER_OPEN',
  NIGHT_WITCH: 'NIGHT_WITCH_OPEN',
  NIGHT_RESOLVE: 'NIGHT_RESOLVE',
  DAY_ANNOUNCE: 'DAY_ANNOUNCE',
  DAY_INPUT: 'DAY_INPUT',
};

const phaseCloseKey: Record<string, keyof typeof narrationCatalog | undefined> = {
  NIGHT_GUARD: 'NIGHT_GUARD_CLOSE',
  NIGHT_WEREWOLF: 'NIGHT_WEREWOLF_CLOSE',
  NIGHT_SEER: 'NIGHT_SEER_CLOSE',
  NIGHT_WITCH: 'NIGHT_WITCH_CLOSE',
};

export function buildTransitionNarration(prevPhase: string | null, currentPhase: string, opts?: { witchVictimName?: string | null }): NarrationClip[] {
  const clips: NarrationClip[] = [];

  if (prevPhase && phaseCloseKey[prevPhase]) {
    clips.push(narrationCatalog[phaseCloseKey[prevPhase]!]);
  }

  const openKey = phaseOpenKey[currentPhase];
  if (openKey) {
    clips.push(narrationCatalog[openKey]);
  }

  return clips;
}

export function speakByBrowser(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      reject(new Error('BROWSER_TTS_UNAVAILABLE'));
      return;
    }
    try {
      assertPublicNarration(text);
    } catch (e) {
      reject(e as Error);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1;
    u.pitch = 1;
    u.onend = () => resolve();
    u.onerror = () => reject(new Error('BROWSER_TTS_FAILED'));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

export function speakByPrebuilt(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('AUDIO_UNAVAILABLE'));
      return;
    }
    const audio = new Audio(`/audio/host/${key}.mp3`);
    audio.preload = 'auto';
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error('PREBUILT_AUDIO_MISSING'));
    audio.play().catch(() => reject(new Error('PREBUILT_AUDIO_PLAY_BLOCKED')));
  });
}

export function preloadPrebuilt(keys: string[]) {
  if (typeof window === 'undefined') return;
  keys.forEach((k) => {
    const a = new Audio(`/audio/host/${k}.mp3`);
    a.preload = 'auto';
    a.load();
  });
}
