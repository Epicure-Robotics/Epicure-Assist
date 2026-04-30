#!/usr/bin/env tsx
/**
 * Test Shopify enrichment logic
 *
 * Usage:
 *   pnpm tsx scripts/test-shopify-enrichment.ts <order_number_or_email>
 *
 * Example:
 *   pnpm tsx scripts/test-shopify-enrichment.ts "#18971"
 *   pnpm tsx scripts/test-shopify-enrichment.ts "prupisleon@gmail.com"
 */
import { getCustomerOrdersByEmail, searchOrderByName } from "../lib/shopify/client";

async function main() {
  const query = process.argv[2];

  if (!query) {
    console.log("Usage: pnpm tsx scripts/test-shopify-enrichment.ts <order_number_or_email>");
    process.exit(1);
  }

  console.log(`🔍 Checking Shopify data for: ${query}`);
  console.log("==================================================\n");

  try {
    let result;
    if (query.includes("@")) {
      result = await getCustomerOrdersByEmail(query);
    } else {
      result = await searchOrderByName(query);
    }

    if (!result.customer) {
      console.log("❌ Customer/Order not found.");
      return;
    }

    console.log(`👤 Customer: ${result.customer.first_name} ${result.customer.last_name} (${result.customer.email})`);
    console.log(`📦 Orders Found: ${result.orders.length}\n`);

    result.orders.forEach((order) => {
      console.log(`Order ${order.name} (${order.created_at})`);
      console.log(`- Status: ${order.financial_status}`);
      console.log(`- Fulfillment: ${order.fulfillment_status}`);

      if (order.fulfillments) {
        order.fulfillments.forEach((f, i) => {
          console.log(`  Shipment #${i + 1}:`);
          console.log(`    - Status: ${f.status}`);
          console.log(`    - Tracking: ${f.tracking_number} (${f.tracking_company})`);
          console.log(`    - Delivery Date: ${f.delivery_date || "NONE"}`);
          console.log(`    - Delivery Status: ${f.delivery_status || "NONE"}`);
          console.log(`    - Latest Update Date: ${f.latest_event_date || "NONE"}`);
          console.log(`    - Latest Update Status: ${f.latest_event_status || "NONE"}`);
          console.log(`    - Estimated Delivery: ${f.estimated_delivery_date || "NONE"}`);
        });
      } else {
        console.log("  (No fulfillments found)");
      }
      console.log("");
    });
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
