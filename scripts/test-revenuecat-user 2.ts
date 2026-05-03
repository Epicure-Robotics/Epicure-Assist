#!/usr/bin/env tsx
/**
 * Test script to check a specific user's RevenueCat subscription status
 * Usage: pnpm tsx scripts/test-revenuecat-user.ts <firebase_id>
 */
import { getSubscriptionDetails, isRevenueCatConfigured } from "@/lib/revenuecat/client";

async function main() {
  const firebaseId = process.argv[2];

  if (!firebaseId) {
    console.error("❌ Error: Firebase ID required");
    console.error("");
    console.error("Usage:");
    console.error(
      "  pnpm with-dev-env node --conditions=react-server --import=tsx/esm scripts/test-revenuecat-user.ts <firebase_id>",
    );
    console.error("");
    console.error("Example:");
    console.error(
      "  pnpm with-dev-env node --conditions=react-server --import=tsx/esm scripts/test-revenuecat-user.ts UtgdpmIp9wb9C5YMzzhfLx9NSXT2",
    );
    process.exit(1);
  }

  console.log("🔍 RevenueCat Subscription Checker");
  console.log("=".repeat(60));
  console.log();

  // Check configuration
  if (!isRevenueCatConfigured()) {
    console.error("❌ RevenueCat not configured");
    console.error("   Set REVENUECAT_API_KEY in .env.local");
    process.exit(1);
  }

  console.log(`📋 Checking Firebase ID: ${firebaseId}`);
  console.log();

  // Get subscription details
  const details = await getSubscriptionDetails(firebaseId);

  if (!details) {
    console.log("⚠️  User not found in RevenueCat");
    console.log();
    console.log("Possible reasons:");
    console.log("  - User never started a trial/subscription");
    console.log("  - Firebase ID is incorrect");
    console.log("  - User ID doesn't exist in RevenueCat");
    process.exit(0);
  }

  console.log("─".repeat(60));
  console.log("📊 Subscription Analysis");
  console.log("─".repeat(60));
  console.log();

  console.log(`Manual Entitlement:       ${details.hasManualEntitlement ? "✓ YES" : "✗ NO"}`);
  console.log(`Promotional Subscription: ${details.hasPromotionalSubscription ? "✓ YES" : "✗ NO"}`);
  console.log(`Store Subscription:       ${details.hasStoreSubscription ? "✓ YES" : "✗ NO"}`);
  console.log(`Has Duplicate:            ${details.hasDuplicate ? "⚠️  YES - WILL SEND EMAIL" : "✓ NO"}`);
  console.log();

  if (details.entitlements.length > 0) {
    console.log("📦 Entitlements:");
    details.entitlements.forEach((e) => console.log(`   - ${e}`));
    console.log();
  }

  if (details.subscriptions.length > 0) {
    console.log("🛒 Subscriptions:");
    details.subscriptions.forEach((s) => console.log(`   - ${s}`));
    console.log();
  }

  console.log("─".repeat(60));
  console.log();

  if (details.hasDuplicate) {
    console.log("⚠️  DUPLICATE DETECTED!");
    console.log();
    console.log("This user has BOTH:");
    console.log("  1. Promotional subscription (granted by admin, $0)");
    console.log("  2. Active store subscription (App Store/Play Store, charged)");
    console.log();
    console.log("Action: Will send reminder email to cancel store subscription");
    console.log("        to avoid double charges.");
  } else if (details.hasPromotionalSubscription && !details.hasStoreSubscription) {
    console.log("✓ Promotional subscription only");
    console.log();
    console.log("This user has a promotional subscription (granted by admin)");
    console.log("No store subscription, so no risk of double charges.");
  } else if (details.hasStoreSubscription && !details.hasPromotionalSubscription) {
    console.log("✓ Store subscription only");
    console.log();
    console.log("This user has a normal App Store/Play Store subscription");
    console.log("No promotional subscription, so no risk of double charges.");
  } else if (details.hasManualEntitlement && !details.hasStoreSubscription) {
    console.log("✓ Manual entitlement only");
    console.log();
    console.log("This user has a manual entitlement (granted via RevenueCat dashboard)");
    console.log("No store subscription, so no risk of double charges.");
  } else {
    console.log("ℹ️  No active subscriptions found");
  }

  console.log();
}

main().catch((error) => {
  console.error();
  console.error("❌ Error:");
  console.error(error);
  process.exit(1);
});
