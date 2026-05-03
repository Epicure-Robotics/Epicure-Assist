#!/usr/bin/env tsx
/**
 * Test condition evaluation script
 *
 * Usage:
 *   pnpm tsx scripts/test-condition.ts <email> "<condition>" ["<conversation text>"]
 *
 * Example:
 *   pnpm tsx scripts/test-condition.ts user@example.com "Customer has an active subscription"
 *   pnpm tsx scripts/test-condition.ts user@example.com "Customer is asking about refund" "I want my money back"
 */
import { evaluateCondition } from "../lib/ai/conditionChecker";

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: pnpm tsx scripts/test-condition.ts <email> "<condition>" ["<conversation text>"]');
    console.log("");
    console.log("Examples:");
    console.log(
      '  pnpm tsx scripts/test-condition.ts user@example.com "Customer has placed an order in the last 30 days"',
    );
    console.log(
      '  pnpm tsx scripts/test-condition.ts user@example.com "Customer mentions refund" "I want my money back"',
    );
    process.exit(1);
  }

  const [email, condition, conversationText] = args;

  console.log("🔍 Testing condition evaluation");
  console.log("================================");
  console.log(`📧 Email: ${email}`);
  console.log(`📝 Condition: ${condition}`);
  if (conversationText) {
    console.log(`💬 Conversation: ${conversationText}`);
  }
  console.log("");

  try {
    console.log("⏳ Evaluating condition...\n");
    const startTime = Date.now();

    const result = await evaluateCondition({
      conditionText: condition!,
      email: email ?? null,
      conversationSubject: null,
      conversationText: conversationText ?? null,
      verbose: true,
    });

    const duration = Date.now() - startTime;

    console.log("✅ Result:");
    console.log(`   Condition Met: ${result.conditionMet ? "YES ✓" : "NO ✗"}`);
    console.log(`   Reasoning: ${result.reasoning}`);
    console.log("");
    console.log(`⏱️  Completed in ${duration}ms`);
  } catch (error) {
    console.error("❌ Error evaluating condition:", error);
    process.exit(1);
  }
}

main();
