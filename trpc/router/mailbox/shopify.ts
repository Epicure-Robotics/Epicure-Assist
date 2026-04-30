import { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { getCustomerOrdersByEmail, isShopifyConfigured, searchOrderByName } from "@/lib/shopify/client";
import { ShopifyApiError } from "@/lib/shopify/types";
import { captureExceptionAndLog } from "@/lib/shared/sentry";
import { mailboxProcedure } from "./procedure";

export const shopifyRouter = {
  getCustomerOrders: mailboxProcedure
    .input(
      z.object({
        email: z.string().email(),
      }),
    )
    .query(async ({ input }) => {
      // Check if Shopify is configured
      if (!isShopifyConfigured()) {
        return {
          configured: false,
          customer: null,
          orders: [],
          error: null,
        };
      }

      try {
        const { customer, orders } = await getCustomerOrdersByEmail(input.email);

        return {
          configured: true,
          customer,
          orders,
          error: null,
        };
      } catch (error) {
        // Log the error but return a graceful response
        captureExceptionAndLog(error, {
          extra: {
            email: input.email,
            operation: "shopify.getCustomerOrders",
          },
        });

        // Return user-friendly error message
        let errorMessage = "Failed to fetch Shopify orders";

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
        }

        return {
          configured: true,
          customer: null,
          orders: [],
          error: errorMessage,
        };
      }
    }),

  getOrderByName: mailboxProcedure
    .input(
      z.object({
        orderName: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      // Check if Shopify is configured
      if (!isShopifyConfigured()) {
        return {
          configured: false,
          customer: null,
          orders: [],
          error: null,
        };
      }

      try {
        const { customer, orders } = await searchOrderByName(input.orderName);

        return {
          configured: true,
          customer,
          orders,
          error: null,
        };
      } catch (error) {
        // Log the error but return a graceful response
        captureExceptionAndLog(error, {
          extra: {
            orderName: input.orderName,
            operation: "shopify.getOrderByName",
          },
        });

        // Return user-friendly error message
        let errorMessage = "Failed to fetch Shopify order";

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
        }

        return {
          configured: true,
          customer: null,
          orders: [],
          error: errorMessage,
        };
      }
    }),
} satisfies TRPCRouterRecord;
