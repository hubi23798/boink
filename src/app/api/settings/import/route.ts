import { NextResponse } from "next/server";
import { DuplicateFileError, ingest } from "@/lib/ingestion/ingest";
import { requireApiAuth } from "@/app/lib/require-auth";
import { getDb } from "@/lib/db/client";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }

  if (!fileEntry.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "Only .csv files are accepted" }, { status: 400 });
  }

  if (fileEntry.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 10 MB limit" }, { status: 400 });
  }

  const buffer = Buffer.from(await fileEntry.arrayBuffer());

  try {
    const result = await ingest(getDb(), tenantId, userId, buffer);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof DuplicateFileError) {
      return NextResponse.json(
        { error: "This file has already been imported", batchId: e.existingBatchId },
        { status: 409 },
      );
    }
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
