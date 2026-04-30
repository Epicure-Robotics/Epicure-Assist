import {
  getCustomerOrdersByEmail,
  isShopifyConfigured,
  searchOrderByName,
  searchOrdersByTrackingNumber,
} from "@/lib/shopify/client";
import { ShopifyApiError, ShopifyOrdersResponse } from "@/lib/shopify/types";
import { getArgString, parseArgs } from "./_helpers";

function trimResponse(response: ShopifyOrdersResponse) {
  return {
    customer: response.customer
      ? {
          email: response.customer.email,
          first_name: response.customer.first_name,
          last_name: response.customer.last_name,
          orders_count: response.customer.orders_count,
          total_spent: response.customer.total_spent,
        }
      : null,
    orders: response.orders.map((order) => ({
      name: order.name,
      created_at: order.created_at,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      total_price: order.total_price,
      currency: order.currency,
      note: order.note,
      admin_url: order.admin_url,
      shipping_address: order.shipping_address
        ? {
            name: order.shipping_address.name,
            address1: order.shipping_address.address1,
            address2: order.shipping_address.address2,
            city: order.shipping_address.city,
            province: order.shipping_address.province,
            country: order.shipping_address.country,
            zip: order.shipping_address.zip,
            phone: order.shipping_address.phone,
          }
        : null,
      line_items: order.line_items.map((item) => ({
        title: item.title,
        variant_title: item.variant_title,
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
        fulfillment_status: item.fulfillment_status,
      })),
      fulfillments: (order.fulfillments ?? []).map((f) => ({
        status: f.status,
        shipment_status: f.shipment_status,
        tracking_company: f.tracking_company,
        tracking_number: f.tracking_number,
        tracking_url: f.tracking_url,
        delivery_date: f.delivery_date,
        delivery_status: f.delivery_status,
        estimated_delivery_date: f.estimated_delivery_date,
        latest_event_date: f.latest_event_date,
        latest_event_status: f.latest_event_status,
      })),
    })),
  };
}

const usage = `
Usage:
  pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/get-shopify-data.ts \\
    --email <customer-email>

  pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/get-shopify-data.ts \\
    --order-name <order-name>

  pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/get-shopify-data.ts \\
    --tracking-number <tracking-number>
`;

const run = async () => {
  const args = parseArgs();
  if (args.has("help") || args.has("h")) {
    console.log(usage.trim());
    return;
  }

  const email = getArgString(args, "email");
  const orderName = getArgString(args, "order-name");
  const trackingNumber = getArgString(args, "tracking-number");

  const targets = [email, orderName, trackingNumber].filter(Boolean);
  if (targets.length === 0) {
    throw new Error("Missing lookup target. Provide --email, --order-name, or --tracking-number.");
  }

  if (targets.length > 1) {
    throw new Error("Provide only one lookup target: --email, --order-name, or --tracking-number.");
  }

  if (!isShopifyConfigured()) {
    console.log(
      JSON.stringify(
        {
          configured: false,
          queryType: email ? "email" : orderName ? "order_name" : "tracking_number",
          customer: null,
          orders: [],
          error: null,
        },
        null,
        2,
      ),
    );
    return;
  }

  try {
    const response = email
      ? await getCustomerOrdersByEmail(email)
      : orderName
        ? await searchOrderByName(orderName)
        : await searchOrdersByTrackingNumber(trackingNumber!);

    console.log(
      JSON.stringify(
        {
          configured: true,
          queryType: email ? "email" : orderName ? "order_name" : "tracking_number",
          queryValue: email ?? orderName ?? trackingNumber,
          ...trimResponse(response),
          error: null,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    let errorMessage = "Failed to fetch Shopify data";

    if (error instanceof ShopifyApiError) {
      if (error.statusCode === 401) {
        errorMessage = "Invalid Shopify credentials";
      } else if (error.statusCode === 403) {
        errorMessage = "Insufficient Shopify API permissions";
      } else if (error.statusCode === 429) {
        errorMessage = "Shopify rate limit exceeded. Please try again later.";
      } else {
        errorMessage = error.message;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    console.log(
      JSON.stringify(
        {
          configured: true,
          queryType: email ? "email" : orderName ? "order_name" : "tracking_number",
          queryValue: email ?? orderName ?? trackingNumber,
          customer: null,
          orders: [],
          error: errorMessage,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
};

try {
  await run();
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Failed to run get-shopify-data script");
  }
  process.exit(1);
}
