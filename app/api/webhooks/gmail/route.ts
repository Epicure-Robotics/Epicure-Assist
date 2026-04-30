import { NextRequest, NextResponse } from "next/server";
import { triggerEvent } from "@/jobs/trigger";
import { captureExceptionAndLog } from "@/lib/shared/sentry";

export async function POST(req: NextRequest) {
  console.log("[Gmail Webhook] Received POST request");

  try {
    const json = await req.json();
    console.log("[Gmail Webhook] Parsed JSON body:", JSON.stringify(json, null, 2));

    const headers = Object.fromEntries(req.headers.entries());
    console.log("[Gmail Webhook] Request headers:", JSON.stringify(headers, null, 2));

    console.log("[Gmail Webhook] Triggering event: gmail/webhook.received");
    await triggerEvent("gmail/webhook.received", {
      body: json,
      headers,
    });
    console.log("[Gmail Webhook] Event triggered successfully");

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("[Gmail Webhook] Error occurred:", e);
    console.error("[Gmail Webhook] Error details:", {
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
      name: e instanceof Error ? e.name : undefined,
    });
    captureExceptionAndLog(e);
    return new NextResponse(null, { status: 500 });
  }
}
