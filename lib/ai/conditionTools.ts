import { tool, Tool } from "ai";
import { z } from "zod";
import { isPocketConfigured, searchPocketUserByEmail } from "@/lib/pocket/client";
import { getCustomerOrdersByEmail, isShopifyConfigured } from "@/lib/shopify/client";

/**
 * Build tools for AI-based condition evaluation.
 * These tools allow the AI to fetch customer data to evaluate conditions.
 */
export function buildConditionTools(_email: string | null) {
  const tools: Record<string, Tool> = {};

  // Shopify tool - get customer orders and delivery info
  if (isShopifyConfigured()) {
    tools.shopify_get_customer_orders = tool({
      description:
        "Get Shopify customer information and their order history including delivery status. Use this to check if a customer has recent orders, pending deliveries, or order history.",
      parameters: z.object({
        email: z.string().describe("Customer email address to look up"),
      }),
      execute: async ({ email: lookupEmail }): Promise<Record<string, unknown>> => {
        try {
          const result = await getCustomerOrdersByEmail(lookupEmail);
          if (!result.customer) {
            return { found: false, message: "No customer found with this email" };
          }
          return {
            found: true,
            customer: {
              id: result.customer.id,
              email: result.customer.email,
              name: `${result.customer.first_name || ""} ${result.customer.last_name || ""}`.trim(),
              ordersCount: result.customer.orders_count,
              totalSpent: result.customer.total_spent,
            },
            orders: result.orders.map((order) => ({
              id: order.id,
              name: order.name,
              orderNumber: order.order_number,
              createdAt: order.created_at,
              financialStatus: order.financial_status,
              fulfillmentStatus: order.fulfillment_status,
              totalPrice: order.total_price,
              currency: order.currency,
              itemCount: order.line_items?.length || 0,
              fulfillments: order.fulfillments?.map((f) => ({
                status: f.status,
                trackingNumber: f.tracking_number,
                trackingUrl: f.tracking_url,
                deliveryDate: f.delivery_date,
                deliveryStatus: f.delivery_status,
              })),
            })),
          };
        } catch (error) {
          return { error: `Failed to fetch Shopify data: ${error instanceof Error ? error.message : "Unknown error"}` };
        }
      },
    });
  }

  // PocketUserInfo tool - get Pocket user data
  if (isPocketConfigured()) {
    tools.pocket_user_info = tool({
      description:
        "Get Pocket user information including subscription status, onboarding status, role, and app version. Use this to check user subscription, account status, or user type.",
      parameters: z.object({
        email: z.string().describe("User email address to look up"),
      }),
      execute: async ({ email: lookupEmail }): Promise<Record<string, unknown>> => {
        try {
          const user = await searchPocketUserByEmail(lookupEmail);
          if (!user) {
            return { found: false, message: "No Pocket user found with this email" };
          }
          return {
            found: true,
            user: {
              id: user.id,
              email: user.email,
              displayName: user.display_name,
              subscriptionType: user.subscription_type,
              onboardingStatus: user.onboarding_status,
              role: user.role,
              appVersion: user.app_version,
              isDeleted: user.deleted_at !== null,
              deletionReason: user.deletion_reason,
            },
          };
        } catch (error) {
          return {
            error: `Failed to fetch Pocket user: ${error instanceof Error ? error.message : "Unknown error"}`,
          };
        }
      },
    });
  }

  return tools;
}
