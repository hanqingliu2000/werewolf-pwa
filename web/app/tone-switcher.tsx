'use client';

import { useMemo, useState } from 'react';

type CopyPack = {
  neutral: Record<string, Record<string, string>>;
  immersive: Record<string, Record<string, string>>;
};

export function ToneSwitcher({ copyPack }: { copyPack: CopyPack }) {
  const [tone, setTone] = useState<'neutral' | 'immersive'>('neutral');

  const lines = useMemo(() => {
    const t = copyPack[tone];
    return {
      nightStart: t.broadcast.night_start,
      dayStart: t.broadcast.day_start,
      werewolfAction: t.hint.werewolf_action,
      seerAction: t.hint.seer_action,
      gameEndGood: t.broadcast.game_end_good,
      phaseMismatch: t.error.phase_mismatch,
    };
  }, [tone, copyPack]);

  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>主持文案预览</h3>
        <div className="row">
          <button
            className={tone === 'neutral' ? '' : 'secondary'}
            onClick={() => setTone('neutral')}
          >
            中性版
          </button>
          <button
            className={tone === 'immersive' ? '' : 'secondary'}
            onClick={() => setTone('immersive')}
          >
            沉浸版
          </button>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <div className="kicker">broadcast.night_start</div>
          <div>{lines.nightStart}</div>
        </div>
        <div className="card">
          <div className="kicker">broadcast.day_start</div>
          <div>{lines.dayStart}</div>
        </div>
        <div className="card">
          <div className="kicker">hint.werewolf_action</div>
          <div>{lines.werewolfAction}</div>
        </div>
        <div className="card">
          <div className="kicker">hint.seer_action</div>
          <div>{lines.seerAction}</div>
        </div>
        <div className="card">
          <div className="kicker">broadcast.game_end_good</div>
          <div>{lines.gameEndGood}</div>
        </div>
        <div className="card">
          <div className="kicker">error.phase_mismatch</div>
          <div>{lines.phaseMismatch}</div>
        </div>
      </div>
    </section>
  );
}
