export type Role = 'werewolf' | 'seer' | 'witch' | 'guard' | 'hunter' | 'villager';

export type Phase =
  | 'LOBBY'
  | 'NIGHT_GUARD'
  | 'NIGHT_WEREWOLF'
  | 'NIGHT_SEER'
  | 'NIGHT_WITCH'
  | 'NIGHT_RESOLVE'
  | 'DEATH_REACTION_HUNTER'
  | 'DAY_ANNOUNCE'
  | 'DAY_INPUT'
  | 'CHECK_WIN'
  | 'END';

export type RuleConfig = {
  winMode: 'A' | 'B';
  guardCanRepeatProtect: boolean;
  witchSelfSave: 'none' | 'first-night-only' | 'any-night';
  witchCanSaveAndPoisonSameNight: boolean;
  witchSaveCount: number;
  witchPoisonCount: number;
  hunterCanShootWhenPoisoned: boolean;
  hunterCanShootWhenKilled?: boolean;
  targetPlayers?: number;
  rolePlan?: Partial<Record<Role, number>>;
};

export type Room = {
  id: string;
  hostId: string;
  name: string;
  status: 'lobby' | 'night' | 'day' | 'end';
  currentPhase: Phase;
  currentNightNo: number;
  phaseVersion: number;
  ruleConfig: RuleConfig;
  createdAt: string;
  updatedAt: string;
};

export type Player = {
  id: string;
  roomId: string;
  name: string;
  role: Role | null;
  alive: boolean;
  eliminatedAt: string | null;
  sessionToken: string;
};

export type ActionType = 'guard' | 'kill' | 'see' | 'save' | 'poison' | 'pass';

export type NightAction = {
  id: string;
  roomId: string;
  nightNo: number;
  actorRole: Role;
  actorPlayerId: string;
  targetPlayerId: string;
  actionType: ActionType;
  isFinal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateRoomInput = {
  hostName: string;
  roomName?: string;
  ruleConfig?: Partial<RuleConfig>;
};

export type JoinRoomInput = {
  name: string;
};
