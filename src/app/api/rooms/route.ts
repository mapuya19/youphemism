import { NextResponse } from "next/server";
import { createRoom } from "@/lib/rooms";
import { toResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/rooms — allocate a fresh room and return its code. */
export async function POST() {
  try {
    const room = await createRoom();
    return NextResponse.json({ code: room.code }, { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}
