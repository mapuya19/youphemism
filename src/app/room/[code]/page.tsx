import type { Metadata } from "next";
import { RoomClient } from "@/components/RoomClient";
import { normalizeCode } from "@/lib/code";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `Room ${normalizeCode(code)}`,
    robots: { index: false, follow: false },
  };
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <RoomClient code={normalizeCode(code)} />;
}
