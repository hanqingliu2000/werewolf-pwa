import { RoomScreen } from "../../../ui/room";
export default async function Page({ params }: { params: Promise<{ room: string }> }) {
  const roomId = (await params).room.toUpperCase();
  return <RoomScreen key={roomId} roomId={roomId} />;
}
