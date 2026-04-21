export function mapRoom(row: any) {
  return {
    id: row.id,
    hostId: row.host_id,
    name: row.name,
    status: row.status,
    currentPhase: row.current_phase,
    currentNightNo: row.current_night_no,
    phaseVersion: row.phase_version,
    ruleConfig: row.rule_config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPlayer(row: any, opts?: { revealRole?: boolean; revealSessionToken?: boolean }) {
  const player: Record<string, unknown> = {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    role: opts?.revealRole ? row.role : null,
    alive: row.alive,
    eliminatedAt: row.eliminated_at,
  };
  if (opts?.revealSessionToken) {
    player.sessionToken = row.session_token;
  }
  return player;
}

export function appErrorStatus(message: string) {
  if (message === 'ROOM_NOT_FOUND') return 404;
  if (message === 'FORBIDDEN') return 403;
  if (message === 'UNAUTHORIZED' || message === 'INVALID_SESSION') return 401;
  return 400;
}

export function appError(message: string) {
  return { error: message, status: appErrorStatus(message) };
}
