import type { publicView, privateView, hostView } from "../server/views";
import type { recap } from "../game/engine";
import type { Mutation } from "../server/input";
export type PublicRoom = ReturnType<typeof publicView> & { self: { playerId: string; seat: number; isHost: boolean }; serverTime: number };
export type PrivateRoom = ReturnType<typeof privateView>;
export type HostRoom = ReturnType<typeof hostView>;
export type Recap = ReturnType<typeof recap>;
export type Operation = Mutation["operation"];
export type Receipt = { accepted: true; roomId: string; epochId: string; flowId: string; requestId: string };
