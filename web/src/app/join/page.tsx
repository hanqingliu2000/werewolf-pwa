import { Entry } from "../../ui/entry";
export default async function Page({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const { room } = await searchParams;
  return <Entry initialMode="join" initialRoom={typeof room === "string" ? room : ""} />;
}
