'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { HostTtsMode, buildTransitionNarration, narrationCatalog, preloadPrebuilt, speakByPrebuilt } from '@/lib/host-tts';

type MeView = {
  room: { id: string; name: string; status: string; currentPhase: string; currentNightNo: number };
  me: { id: string; name: string; alive: boolean; role: string | null };
  seerResults?: Array<{ nightNo: number; targetName: string; targetRole: string | null; alignment: 'good' | 'wolf' }>;
  witchStatus?: { usedSave: number; usedPoison: number; maxSave: number; maxPoison: number } | null;
  witchVictim?: { id: string; name: string } | null;
  wolfConsensus?: { wolfCount: number; selectedCount: number; consensus: boolean; allSelected: boolean } | null;
};

type StateView = {
  room: { id: string; hostId: string; currentPhase: string; currentNightNo: number; status: string };
  players: Array<{ id: string; name: string; alive: boolean; role: string | null }>;
  nightActions?: Array<{ actorPlayerId?: string; actor_player_id?: string; actionType?: string; action_type?: string; targetPlayerId?: string; target_player_id?: string }>;
  wolfConsensus?: { wolfCount: number; selectedCount: number; consensus: boolean; allSelected: boolean };
  events?: Array<{ type: string; payload?: Record<string, unknown> }>;
};

type ToastMessage = { kind: 'error' | 'success' | 'info'; text: string };

const phaseAction: Record<string, 'guard' | 'kill' | 'see' | 'save' | null> = {
  NIGHT_GUARD: 'guard',
  NIGHT_WEREWOLF: 'kill',
  NIGHT_SEER: 'see',
  NIGHT_WITCH: 'save',
};

const roleZh: Record<string, string> = {
  guard: '守卫',
  werewolf: '狼人',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  villager: '平民',
};

const actionZh: Record<string, string> = {
  guard: '守护',
  kill: '击杀',
  see: '查验',
  save: '救人',
  poison: '毒人',
  pass: '结束回合',
};

const phaseZh: Record<string, string> = {
  LOBBY: '等待开局',
  NIGHT_GUARD: '夜晚·守卫行动',
  NIGHT_WEREWOLF: '夜晚·狼人行动',
  NIGHT_SEER: '夜晚·预言家行动',
  NIGHT_WITCH: '夜晚·女巫行动',
  NIGHT_RESOLVE: '夜晚结算',
  DEATH_REACTION_HUNTER: '死亡反应·猎人开枪',
  DAY_ANNOUNCE: '白天公布',
  DAY_INPUT: '白天录入',
  CHECK_WIN: '胜负判定',
  END: '对局结束',
};

const errZh: Record<string, string> = {
  PHASE_MISMATCH: '当前阶段不能执行这个操作',
  PHASE_CONFLICT: '阶段状态冲突，请先刷新页面后再试',
  PLAYER_NOT_FOUND: '未找到对应玩家，请刷新后重试',
  TARGET_REQUIRED: '请先选择目标玩家',
  FORBIDDEN: '你没有执行该操作的权限',
  ROOM_NOT_FOUND: '房间不存在',
  PLAYERS_NOT_READY: '人数未达到开局要求',
  WOLF_CONSENSUS_REQUIRED: '狼人尚未达成同一目标，无法确认推进',
  ALREADY_ELIMINATED: '该玩家已经出局，无法继续行动',
};

const explain = (e?: string) => errZh[e || ''] || e || '未知错误';

const phaseActorRole: Record<string, string> = {
  NIGHT_GUARD: 'guard',
  NIGHT_WEREWOLF: 'werewolf',
  NIGHT_SEER: 'seer',
  NIGHT_WITCH: 'witch',
};

const phaseGuide: Record<string, string> = {
  NIGHT_GUARD: '你现在该做什么：守卫选择一名玩家守护。',
  NIGHT_WEREWOLF: '你现在该做什么：狼人选择同一目标并确认。',
  NIGHT_SEER: '你现在该做什么：预言家查验一名玩家。',
  NIGHT_WITCH: '你现在该做什么：女巫决定救人、毒人或结束回合。',
  NIGHT_RESOLVE: '你现在该做什么：等待房主执行夜晚结算。',
  DEATH_REACTION_HUNTER: '你现在该做什么：猎人可选择开枪带走一名玩家。',
  DAY_ANNOUNCE: '你现在该做什么：等待房主推进到白天录入。',
  DAY_INPUT: '你现在该做什么：房主录入白天结果。',
};

const progressPhases = ['NIGHT_GUARD', 'NIGHT_WEREWOLF', 'NIGHT_SEER', 'NIGHT_WITCH', 'NIGHT_RESOLVE', 'DAY_INPUT'];

function eventSummary(event?: { type: string; payload?: Record<string, unknown> }) {
  if (!event) return '';
  if (event.type === 'night_resolve') {
    const deaths = (event.payload?.deaths as Array<{ name?: string }> | undefined)?.map((d) => d.name).filter(Boolean) || [];
    return deaths.length ? `昨夜出局：${deaths.join('、')}` : '昨夜无人出局';
  }
  if (event.type === 'day_vote') return '白天录入已完成';
  if (event.type === 'game_end') {
    const winner = String(event.payload?.winner || '');
    return `游戏结束：${winner === 'good' ? '好人阵营' : '狼人阵营'}获胜`;
  }
  return `事件：${event.type}`;
}

export default function PlayPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const roomId = String(params.roomId || '').toUpperCase();

  const [playerId, setPlayerId] = useState('');
  const [playerToken, setPlayerToken] = useState('');
  const [targetId, setTargetId] = useState('');
  const [eliminatedId, setEliminatedId] = useState('');
  const [shotTargetId, setShotTargetId] = useState('');
  const [meView, setMeView] = useState<MeView | null>(null);
  const [stateView, setStateView] = useState<StateView | null>(null);
  const [msg, setMsg] = useState<ToastMessage | null>(null);
  const [ttsMsg, setTtsMsg] = useState<ToastMessage | null>(null);
  const [ttsMode] = useState<HostTtsMode>('prebuilt');
  const [ttsAuto, setTtsAuto] = useState(true);
  const [ttsReady, setTtsReady] = useState(true);
  const lastNarratedPhaseRef = useRef<string>('');
  const prevPhaseRef = useRef<string | null>(null);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsProcessingRef = useRef(false);

  useEffect(() => {
    const q = search.get('playerId');
    const cached = localStorage.getItem(`ww:player:${roomId}`) || '';
    const cachedToken = localStorage.getItem(`ww:token:${roomId}`) || '';
    const pid = q || cached;
    setPlayerId(pid);
    setPlayerToken(cachedToken);
    const mode = 'prebuilt' as HostTtsMode;
    const savedAuto = localStorage.getItem('ww:hostTtsAuto');
    const auto = savedAuto == null ? true : savedAuto === '1';
    setTtsAuto(auto);
  }, [roomId, search]);

  async function refresh() {
    if (!playerId) return;
    const [meRes, stRes] = await Promise.all([
      fetch(`/api/rooms/${roomId}/me?playerId=${encodeURIComponent(playerId)}`, {
        headers: { 'x-player-token': playerToken },
      }),
      fetch(`/api/rooms/${roomId}/state`),
    ]);
    const meJson = await meRes.json();
    const stJson = await stRes.json();
    if (!meRes.ok) return setMsg({ kind: 'error', text: `获取失败：${explain(meJson.error)}` });
    if (!stRes.ok) return setMsg({ kind: 'error', text: `刷新失败：${explain(stJson.error)}` });
    setMeView(meJson);
    setStateView(stJson);
    localStorage.setItem(`ww:player:${roomId}`, playerId);
  }

  useEffect(() => {
    if (!playerId) return;
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, roomId]);

  const isHost = !!(stateView && stateView.room.hostId === playerId);
  const action = stateView ? phaseAction[stateView.room.currentPhase] : null;
  const myRole = meView?.me.role || null;
  const canAct = !!(
    meView?.me.alive &&
    action &&
    ((action === 'guard' && myRole === 'guard') || (action === 'kill' && myRole === 'werewolf') || (action === 'see' && myRole === 'seer') || (action === 'save' && myRole === 'witch'))
  );

  const aliveTargets = useMemo(() => (stateView?.players || []).filter((p) => p.alive && p.id !== playerId), [stateView, playerId]);
  const latestEvent = useMemo(() => (stateView?.events || [])[0], [stateView]);
  const requiredRole = phaseActorRole[stateView?.room.currentPhase || ''];
  const requiredRoleZh = roleZh[requiredRole || ''] || '其他身份';

  const actedPlayers = useMemo(() => {
    const actions = stateView?.nightActions || [];
    return new Set(actions.map((a) => a.actorPlayerId || a.actor_player_id).filter(Boolean));
  }, [stateView]);

  const witchHasSave = useMemo(() => {
    if (myRole !== 'witch') return false;
    return (meView?.witchStatus?.usedSave ?? 0) >= (meView?.witchStatus?.maxSave ?? 1);
  }, [meView, myRole]);

  const witchHasPoison = useMemo(() => {
    if (myRole !== 'witch') return false;
    return (meView?.witchStatus?.usedPoison ?? 0) >= (meView?.witchStatus?.maxPoison ?? 1);
  }, [meView, myRole]);

  const pendingActors = useMemo(() => {
    const role = requiredRole;
    if (!role) return [] as string[];
    const candidates = (stateView?.players || []).filter((p) => p.alive && p.role === role);
    return candidates.filter((p) => !actedPlayers.has(p.id)).map((p) => p.name);
  }, [requiredRole, stateView, actedPlayers]);

  const privateWolfConsensus = meView?.wolfConsensus ?? null;

  const wolfConsensusReady = useMemo(() => {
    if (stateView?.room.currentPhase !== 'NIGHT_WEREWOLF') return false;
    return !!privateWolfConsensus?.consensus;
  }, [stateView, privateWolfConsensus]);

  const primaryActionDisabledReason = !targetId ? '请先选择目标玩家' : '';
  const dayEliminateDisabledReason = !eliminatedId ? '请先选择被淘汰玩家' : '';

  async function submitNightAction(actionType: 'guard' | 'kill' | 'see' | 'save' | 'poison' | 'pass', confirm = false) {
    setMsg(null);
    const body = actionType === 'pass'
      ? { actorPlayerId: playerId, actionType, confirm }
      : { actorPlayerId: playerId, targetPlayerId: targetId, actionType, confirm };
    const res = await fetch(`/api/rooms/${roomId}/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-player-token': playerToken },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) return setMsg({ kind: 'error', text: `提交失败：${explain(json.error)}` });
    setMsg({ kind: 'success', text: `已提交：${actionZh[json.acceptedAction] || json.acceptedAction}` });
    await refresh();
  }

  async function resolveNight() {
    const res = await fetch(`/api/rooms/${roomId}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-player-token': playerToken },
      body: JSON.stringify({ hostPlayerId: playerId }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg({ kind: 'error', text: `夜晚结算失败：${explain(json.error)}` });
    setMsg({ kind: 'success', text: `夜晚结算完成：${(json.deaths || []).map((d: { name: string }) => d.name).join('、') || '无人出局'}` });
    await refresh();
  }

  async function toDayInput() {
    const res = await fetch(`/api/rooms/${roomId}/day-announce`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-player-token': playerToken },
      body: JSON.stringify({ hostPlayerId: playerId }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg({ kind: 'error', text: `进入白天录入失败：${explain(json.error)}` });
    setMsg({ kind: 'success', text: '已进入白天录入。' });
    await refresh();
  }

  async function submitDayVote(noKill = false) {
    const targetName = (stateView?.players || []).find((p) => p.id === eliminatedId)?.name;
    const ok = noKill
      ? window.confirm('确认录入“无人出局”吗？')
      : window.confirm(`确认录入淘汰：${targetName || '该玩家'} 吗？`);
    if (!ok) return;

    const res = await fetch(`/api/rooms/${roomId}/day-vote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-player-token': playerToken },
      body: JSON.stringify({ hostPlayerId: playerId, eliminatedPlayerId: noKill ? null : eliminatedId || null }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg({ kind: 'error', text: `白天录入失败：${explain(json.error)}` });
    setMsg({ kind: 'success', text: json.winner ? `游戏结束：${json.winner === 'good' ? '好人' : '狼人'}胜` : '白天录入完成，进入下一夜。' });
    await refresh();
  }

  async function submitHunterShot() {
    if (!shotTargetId) return setMsg({ kind: 'error', text: '请先选择开枪目标。' });
    const targetName = (stateView?.players || []).find((p) => p.id === shotTargetId)?.name;
    const ok = window.confirm(`确认猎人开枪目标：${targetName || '该玩家'}？`);
    if (!ok) return;

    const res = await fetch(`/api/rooms/${roomId}/hunter-shot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-player-token': playerToken },
      body: JSON.stringify({ hunterPlayerId: playerId, targetPlayerId: shotTargetId }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg({ kind: 'error', text: `猎人开枪失败：${explain(json.error)}` });
    setMsg({ kind: 'success', text: '猎人开枪已录入。' });
    await refresh();
  }

  async function restartGame() {
    const ok = window.confirm('确认“再来一局”？将保留当前玩家，重置为等待开局。');
    if (!ok) return;

    const res = await fetch(`/api/rooms/${roomId}/restart`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-player-token': playerToken },
      body: JSON.stringify({ hostPlayerId: playerId }),
    });
    const json = await res.json();
    if (!res.ok) return setMsg({ kind: 'error', text: `重开失败：${explain(json.error)}` });
    setMsg({ kind: 'success', text: '已重置到等待区，玩家无需重新加入。' });
    router.push(`/room/${roomId}/lobby?playerId=${encodeURIComponent(playerId)}`);
  }

  async function playNarrationClip(clip: { key: string; text: string }) {
    await speakByPrebuilt(clip.key);
  }

  function currentWitchVictimName() {
    if (!stateView || stateView.room.currentPhase !== 'NIGHT_WITCH') return null;
    return meView?.witchVictim?.name || null;
  }

  async function playPhaseNarration(phase: string) {
    const clips = buildTransitionNarration(prevPhaseRef.current, phase, { witchVictimName: currentWitchVictimName() });
    if (!clips.length) return;
    try {
      for (const clip of clips) await playNarrationClip(clip);
      setTtsMsg({ kind: 'info', text: `主持播报：${clips.map((c) => c.text).join(' ')}` });
      lastNarratedPhaseRef.current = phase;
      prevPhaseRef.current = phase;
    } catch (e) {
      const reason = (e as Error).message === 'PRIVATE_NARRATION_BLOCKED'
        ? '命中隐私护栏：私密信息禁止公共播报'
        : (e as Error).message;
      setTtsMsg({ kind: 'error', text: `语音播报失败：${reason}（请点击“解锁语音播放”后重试）` });
      setTtsReady(false);
    }
  }

  async function processTtsQueue() {
    if (ttsProcessingRef.current) return;
    ttsProcessingRef.current = true;
    try {
      while (ttsQueueRef.current.length) {
        const phase = ttsQueueRef.current.shift()!;
        await playPhaseNarration(phase);
      }
    } finally {
      ttsProcessingRef.current = false;
    }
  }

  function enqueuePhaseNarration(phase: string) {
    const hasPhase = buildTransitionNarration(prevPhaseRef.current, phase).length > 0;
    if (!hasPhase) return;
    const q = ttsQueueRef.current;
    if (q[q.length - 1] === phase || lastNarratedPhaseRef.current === phase) return;
    q.push(phase);
    processTtsQueue();
  }

  function narrateCurrentPhase() {
    if (!stateView) return;
    enqueuePhaseNarration(stateView.room.currentPhase);
  }

  function primeTts() {
    setTtsReady(true);
    if (ttsMode === 'prebuilt') {
      preloadPrebuilt(Object.values(narrationCatalog).map((x) => x.key));
    }
    setTtsMsg({ kind: 'info', text: '语音主持已解锁，可开始播报。' });
  }

  useEffect(() => {
    if (ttsReady) return;
    const unlock = () => setTtsReady(true);
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [ttsReady]);

  useEffect(() => {
    localStorage.setItem('ww:hostTtsAuto', ttsAuto ? '1' : '0');
    if (ttsReady && ttsMode === 'prebuilt') {
      preloadPrebuilt(Object.values(narrationCatalog).map((x) => x.key));
    }
  }, [ttsMode, ttsAuto, ttsReady]);

  useEffect(() => {
    if (!stateView) return;
    if (!prevPhaseRef.current) prevPhaseRef.current = stateView.room.currentPhase;
  }, [stateView]);

  const resolvingRef = useRef(false);
  useEffect(() => {
    if (!stateView) return;
    if (stateView.room.currentPhase !== 'NIGHT_RESOLVE') return;
    if (stateView.room.hostId !== playerId) return;
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    fetch(`/api/rooms/${roomId}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-player-token': playerToken },
      body: JSON.stringify({ hostPlayerId: playerId }),
    }).finally(async () => {
      await refresh();
      resolvingRef.current = false;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateView?.room.currentPhase, playerId, playerToken]);

  useEffect(() => {
    if (!ttsAuto || !ttsReady || !stateView) return;
    if (lastNarratedPhaseRef.current === stateView.room.currentPhase) return;
    narrateCurrentPhase();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsAuto, ttsReady, stateView?.room.currentPhase, meView?.witchVictim]);

  if (!playerId) {
    return <main><div className="card"><p>未找到你的玩家身份，请先从“加入房间/创建房间”进入。</p></div></main>;
  }

  const phase = stateView?.room.currentPhase || '';
  const progressActiveIdx = progressPhases.indexOf(phase);

  return (
    <main>
      <div className="card">
        <div className="kicker">Room {roomId}</div>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>{phaseZh[phase] || phase || '加载中'}</h2>
            <p>第 {stateView?.room.currentNightNo || '-'} 夜 · 你是 <b>{meView?.me.name || '-'}</b>（{roleZh[myRole || ''] || '未分配'}）</p>
            <p style={{ color: 'var(--text-muted)' }}>{meView?.me.alive ? '状态：存活' : '状态：已出局（行动禁用）'}</p>
          </div>
          <span className="badge">{meView?.room.name || '狼人杀房间'}</span>
        </div>
        <p className="panel-muted" style={{ marginTop: 8 }}>{phaseGuide[phase] || '你现在该做什么：等待系统阶段推进。'}</p>
        <div className="progress-track" style={{ marginTop: 10 }}>
          {progressPhases.map((p, idx) => {
            const cls = idx === progressActiveIdx ? 'progress-step active' : idx < progressActiveIdx ? 'progress-step done' : 'progress-step';
            return <div className={cls} key={p}>{phaseZh[p].replace('夜晚·', '').replace('白天·', '')}</div>;
          })}
        </div>
      </div>

      {!ttsReady ? (
        <div className="card">
          <p>语音未解锁（浏览器限制）。点击一次即可恢复自动播报。</p>
          <button className="secondary" onClick={primeTts}>点击解锁语音播放</button>
        </div>
      ) : null}

      {isHost ? (
        <div className="card">
          <h3>语音主持</h3>
          <p>模式：<b>预生成音频（MeloTTS）</b></p>
          <p><label><input type="checkbox" checked={ttsAuto} onChange={(e) => setTtsAuto(e.target.checked)} /> 阶段变化自动播报</label></p>
          <div className="row">
            <button className="secondary" onClick={primeTts}>{ttsReady ? '已解锁播放' : '点击解锁语音播放'}</button>
            <button onClick={narrateCurrentPhase} disabled={!ttsReady}>播报当前阶段</button>
          </div>
        </div>
      ) : null}

      {canAct ? (
        <div className="card">
          <h3>当前行动区</h3>
          {myRole === 'witch' && phase === 'NIGHT_WITCH' ? <><p>女巫药剂状态：救药 {witchHasSave ? '已使用' : '未使用'} / 毒药 {witchHasPoison ? '已使用' : '未使用'}</p><p style={{ color: 'var(--warn)' }}>今晚被狼人击杀目标：<b>{currentWitchVictimName() || '暂无（狼人尚未统一）'}</b></p></> : null}

          {myRole === 'werewolf' && phase === 'NIGHT_WEREWOLF' ? (
            <>
              <p>请先与其他狼人达成同一目标，再点击“确认击杀”。</p>
              <div className="row" style={{ gap: 8 }}>
                {aliveTargets.map((p) => (
                  <button key={p.id} className={targetId === p.id ? '' : 'secondary'} onClick={() => setTargetId(p.id)}>{p.name}</button>
                ))}
              </div>
              <div className="panel-muted" style={{ marginTop: 10 }}>
                <p style={{ marginTop: 0 }}>
                  狼人协作进度：已选择 {privateWolfConsensus?.selectedCount ?? 0} / {privateWolfConsensus?.wolfCount ?? 0}
                </p>
                <p style={{ color: wolfConsensusReady ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                  {wolfConsensusReady ? '已达成共识，可确认推进。' : '尚未达成共识，暂不可确认。'}
                </p>
              </div>
            </>
          ) : (
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">选择目标玩家</option>
              {aliveTargets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          <div className="row" style={{ marginTop: 10 }}>
            {action ? <button disabled={!targetId || (action==='save' && witchHasSave)} onClick={() => submitNightAction(action)}>提交{actionZh[action]}</button> : null}
            {myRole === 'witch' && phase === 'NIGHT_WITCH' ? <button className="secondary" disabled={!meView?.witchVictim} onClick={() => { const tid = meView?.witchVictim?.id || ''; if (tid) { setTargetId(tid); submitNightAction('save'); } }}>救被刀玩家</button> : null}
            {action && primaryActionDisabledReason ? <span style={{ color: 'var(--text-muted)' }}>（{primaryActionDisabledReason}）</span> : null}

            {myRole === 'werewolf' && phase === 'NIGHT_WEREWOLF' ? (
              <button
                className="warn"
                disabled={!wolfConsensusReady}
                onClick={() => {
                  if (!window.confirm('确认狼人目标已一致，并推进到下一阶段？')) return;
                  submitNightAction('kill', true);
                }}
              >确认击杀并推进</button>
            ) : null}

            {myRole === 'witch' && phase === 'NIGHT_WITCH' ? (
              <>
                <button className="secondary" disabled={!targetId || witchHasPoison} onClick={() => submitNightAction('poison')}>提交毒人</button>
                <button className="secondary" onClick={() => submitNightAction('pass')}>结束女巫回合</button>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="card">
          <h3>当前行动区</h3>
          <p>当前轮到：{phaseZh[phase] || '其他阶段'}。</p>
          <p>你是{roleZh[myRole || ''] || '玩家'}，现在请等待。</p>
          {pendingActors.length ? <p>待操作（{requiredRoleZh}）：{pendingActors.join('、')}</p> : <p>系统正在推进到下一阶段…</p>}
        </div>
      )}

      {phase === 'DEATH_REACTION_HUNTER' && meView?.me.alive === false && myRole === 'hunter' ? (
        <div className="card">
          <h3>猎人反应阶段</h3>
          <p>若规则允许，你可以选择一名存活玩家开枪。</p>
          <select value={shotTargetId} onChange={(e) => setShotTargetId(e.target.value)}>
            <option value="">选择开枪目标</option>
            {aliveTargets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="danger" onClick={submitHunterShot} disabled={!shotTargetId}>确认开枪</button>
          </div>
        </div>
      ) : null}

      {phase === 'NIGHT_RESOLVE' ? <div className="card"><p>系统正在自动结算夜晚，请稍候…</p></div> : null}
      {isHost && phase === 'DAY_ANNOUNCE' ? <div className="card"><button onClick={toDayInput}>进入白天录入</button></div> : null}
      {isHost && phase === 'DAY_INPUT' ? (
        <div className="card">
          <h3>白天录入（房主）</h3>
          <select value={eliminatedId} onChange={(e) => setEliminatedId(e.target.value)}>
            <option value="">选择淘汰玩家</option>
            {(stateView?.players || []).filter((p) => p.alive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="row" style={{ marginTop: 8 }}>
            <button disabled={!eliminatedId} onClick={() => submitDayVote(false)}>录入淘汰</button>
            {!eliminatedId ? <span style={{ color: 'var(--text-muted)' }}>（{dayEliminateDisabledReason}）</span> : null}
            <button className="secondary" onClick={() => submitDayVote(true)}>录入无人出局</button>
          </div>
        </div>
      ) : null}

      {isHost && phase === 'END' ? (
        <div className="card">
          <h3>房主操作</h3>
          <p>本局已结束，可直接重开并保留当前玩家名单。</p>
          <div className="row">
            <button onClick={restartGame}>再来一局（保留玩家）</button>
          </div>
        </div>
      ) : null}

      {myRole === 'seer' ? (
        <div className="card">
          <h3>预言家查验记录</h3>
          {meView?.seerResults?.length ? (
            <ul>
              {meView.seerResults.map((r, i) => (
                <li key={i}>第 {r.nightNo} 夜：{r.targetName}（{r.alignment === 'wolf' ? '狼人阵营' : '好人阵营'}）</li>
              ))}
            </ul>
          ) : <p style={{ color: 'var(--text-muted)' }}>暂无查验记录</p>}
        </div>
      ) : null}

      <div className="card">
        <h3>系统事件流</h3>
        {stateView?.events?.length ? (
          <ul>
            {stateView.events.slice(0, 6).map((e, idx) => <li key={`${e.type}-${idx}`}>{eventSummary(e)}</li>)}
          </ul>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>暂无事件。</p>
        )}
      </div>

      <div className="card">
        <h3>玩家状态</h3>
        <ul>
          {(stateView?.players || []).map((p) => (
            <li key={p.id} style={{ opacity: p.alive ? 1 : 0.65 }}>
              {p.name} · {roleZh[p.role || ''] || '未分配'} · {p.alive ? '存活' : '出局（禁用）'}
            </li>
          ))}
        </ul>
      </div>

      {latestEvent ? <div className="card"><p>最近结果：{eventSummary(latestEvent)}</p></div> : null}
      {msg ? <div className={`toast ${msg.kind}`}>{msg.text}</div> : null}
      {ttsMsg ? <div className={`toast ${ttsMsg.kind}`}>{ttsMsg.text}</div> : null}
    </main>
  );
}
