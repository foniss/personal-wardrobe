import { NextResponse } from "next/server";
import { localProvider, providerDiagnostics } from "@/lib/tryon/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live status of the LOCAL virtual try-on service, for the status pill.
 * Cheap: only pings 127.0.0.1/health, never runs a generation.
 */
export async function GET() {
  const diagnostics = providerDiagnostics();
  const local = localProvider();

  // Only probe when the local provider is actually in play.
  const health = local.isConfigured() ? await local.health() : null;

  return NextResponse.json({
    provider: diagnostics,
    local: health,
  });
}
