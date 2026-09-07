import { NextResponse } from "next/server";
import { runScan } from "@/lib/scan";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runScan();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[scan] failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "scan failed" }, { status: 500 });
  }
}
