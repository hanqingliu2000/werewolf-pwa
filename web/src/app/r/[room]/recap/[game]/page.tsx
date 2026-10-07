import { RecapScreen } from "../../../../../ui/recap";
export default async function Page({ params }: { params: Promise<{ room: string; game: string }> }) {
  const { room, game } = await params;
  return <RecapScreen key={`${room}:${game}`} roomId={room.toUpperCase()} gameId={game} />;
}
