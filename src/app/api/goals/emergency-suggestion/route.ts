import { NextResponse } from "next/server";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";
import { suggestEmergencyFund } from "@/lib/goals/suggest";

export async function GET() {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const suggestion = await suggestEmergencyFund(getDb());
  return NextResponse.json(suggestion);
}
