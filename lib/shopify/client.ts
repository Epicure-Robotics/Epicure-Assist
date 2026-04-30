import { env } from "@/lib/env";
import { captureExceptionAndLog } from "@/lib/shared/sentry";
import {
  ShopifyApiError,
  ShopifyCustomer,
  ShopifyCustomerOrdersApiResponse,
  ShopifyCustomerSearchResponse,
  ShopifyFulfillment,
  ShopifyFulfillmentEventsResponse,
  ShopifyFulfillmentsResponse,
  ShopifyOrder,
  ShopifyOrdersResponse,
  ShopifyOrderWithUrl,
} from "./types";

const SHOPIFY_API_TIMEOUT_MS = 15000; // 15 seconds

/**
 * Check if Shopify integration is configured
 */
export function isShopifyConfigured(): boolean {
  return !!(env.SHOPIFY_SHOP_DOMAIN && env.SHOPIFY_ADMIN_ACCESS_TOKEN);
}

/**
 * Get the base URL for Shopify Admin API
 */
function getShopifyBaseUrl(): string {
  const domain = env.SHOPIFY_SHOP_DOMAIN;
  const version = env.SHOPIFY_API_VERSION || "2025-01";
  return `https://${domain}/admin/api/${version}`;
}

/**
 * Make an authenticated request to Shopify Admin API
 */
async function shopifyRequest<T>(endpoint: string): Promise<T> {
  if (!isShopifyConfigured()) {
    throw new ShopifyApiError(
      "Shopify is not configured. Please set SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN.",
    );
  }

  const url = `${getShopifyBaseUrl()}${endpoint}`;
  const token = env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": token!,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(SHOPIFY_API_TIMEOUT_MS),
    });

    if (!response.ok) {
      const responseText = await response.text();

      // Handle common error cases
      if (response.status === 401) {
        throw new ShopifyApiError("Invalid Shopify access token", response.status, responseText);
      } else if (response.status === 403) {
        throw new ShopifyApiError("Insufficient permissions for Shopify API", response.status, responseText);
      } else if (response.status === 429) {
        throw new ShopifyApiError("Shopify API rate limit exceeded", response.status, responseText);
      } else if (response.status === 404) {
        throw new ShopifyApiError("Shopify resource not found", response.status, responseText);
      } else {
        throw new ShopifyApiError(
          `Shopify API error: ${response.status} ${response.statusText}`,
          response.status,
          responseText,
        );
      }
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ShopifyApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ShopifyApiError("Shopify API request timed out");
    }

    if (error instanceof Error) {
      throw new ShopifyApiError(`Shopify API request failed: ${error.message}`);
    }

    throw new ShopifyApiError("Unknown error occurred while calling Shopify API");
  }
}

/**
 * Search for a customer by email address
 * @param email - Customer email address
 * @returns ShopifyCustomer or null if not found
 */
export async function searchCustomerByEmail(email: string): Promise<ShopifyCustomer | null> {
  try {
    const encodedEmail = encodeURIComponent(email);
    const response = await shopifyRequest<ShopifyCustomerSearchResponse>(
      `/customers/search.json?query=email:${encodedEmail}`,
    );

    if (response.customers && response.customers.length > 0) {
      const customer = response.customers[0];
      return customer ?? null;
    }

    return null;
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        email,
        operation: "searchCustomerByEmail",
      },
    });
    throw error;
  }
}

/**
 * Get orders for a specific customer ID
 * @param customerId - Shopify customer ID
 * @returns Array of ShopifyOrder
 */
export async function getCustomerOrders(customerId: number): Promise<ShopifyOrder[]> {
  try {
    // Include status=any to get orders in all statuses (open, closed, cancelled, etc.)
    // Default Shopify API only returns open orders
    const response = await shopifyRequest<ShopifyCustomerOrdersApiResponse>(
      `/customers/${customerId}/orders.json?status=any&limit=250`,
    );

    return response.orders || [];
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        customerId,
        operation: "getCustomerOrders",
      },
    });
    throw error;
  }
}

/**
 * Get fulfillments for a specific order
 * @param orderId - Shopify order ID
 * @returns Array of ShopifyFulfillment
 */
export async function getOrderFulfillments(orderId: number): Promise<ShopifyFulfillment[]> {
  try {
    const response = await shopifyRequest<ShopifyFulfillmentsResponse>(`/orders/${orderId}/fulfillments.json`);
    return response.fulfillments || [];
  } catch (error) {
    // If it's a 404, the order might not have fulfillments yet
    if (error instanceof ShopifyApiError && error.statusCode === 404) {
      return [];
    }
    captureExceptionAndLog(error, {
      extra: {
        orderId,
        operation: "getOrderFulfillments",
      },
    });
    // Don't throw - just return empty array to avoid breaking the order fetch
    return [];
  }
}

/**
 * Get fulfillment events for a specific fulfillment
 * @param orderId - Shopify order ID
 * @param fulfillmentId - Shopify fulfillment ID
 * @returns Array of fulfillment events
 */
export async function getFulfillmentEvents(orderId: number, fulfillmentId: number) {
  try {
    const response = await shopifyRequest<ShopifyFulfillmentEventsResponse>(
      `/orders/${orderId}/fulfillments/${fulfillmentId}/events.json`,
    );
    return response.fulfillment_events || [];
  } catch (error) {
    // If it's a 404, the fulfillment might not have events yet
    if (error instanceof ShopifyApiError && error.statusCode === 404) {
      return [];
    }
    captureExceptionAndLog(error, {
      extra: {
        orderId,
        fulfillmentId,
        operation: "getFulfillmentEvents",
      },
    });
    // Don't throw - just return empty array
    return [];
  }
}

/**
 * Enrich a fulfillment with delivery information from events
 * @param fulfillment - ShopifyFulfillment to enrich
 * @param orderId - Shopify order ID
 * @returns Enriched ShopifyFulfillment
 */
async function enrichFulfillmentWithEvents(
  fulfillment: ShopifyFulfillment,
  orderId: number,
): Promise<ShopifyFulfillment> {
  try {
    const events = await getFulfillmentEvents(orderId, fulfillment.id);

    if (events.length === 0) return fulfillment;

    // Find the delivered event
    const deliveredEvent = events.find(
      (event) => event.status?.toLowerCase() === "delivered" || event.message?.toUpperCase().includes("DELIVERED"),
    );

    // Find latest event for "last update"
    const latestEvent = events[events.length - 1];

    // Find estimation if any
    const estimatedEvent = events.find((e) => e.estimated_delivery_at);

    return {
      ...fulfillment,
      delivery_date: deliveredEvent?.happened_at || null,
      delivery_status: deliveredEvent?.status || deliveredEvent?.message || null,
      latest_event_date: latestEvent?.happened_at || null,
      latest_event_status: latestEvent?.status || latestEvent?.message || null,
      estimated_delivery_date: estimatedEvent?.estimated_delivery_at || null,
    };
  } catch (error) {
    // If enrichment fails, return the fulfillment as-is
    captureExceptionAndLog(error, {
      extra: {
        orderId,
        fulfillmentId: fulfillment.id,
        operation: "enrichFulfillmentWithEvents",
      },
    });
    return fulfillment;
  }
}

/**
 * Enrich an order with fulfillment information including delivery dates
 * @param order - ShopifyOrder to enrich
 * @returns Enriched ShopifyOrder
 */
async function enrichOrderWithFulfillments(order: ShopifyOrder): Promise<ShopifyOrder> {
  try {
    const fulfillments = await getOrderFulfillments(order.id);

    // Enrich each fulfillment with event data
    const enrichedFulfillments = await Promise.all(
      fulfillments.map((fulfillment) => enrichFulfillmentWithEvents(fulfillment, order.id)),
    );

    return {
      ...order,
      fulfillments: enrichedFulfillments,
    };
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        orderId: order.id,
        operation: "enrichOrderWithFulfillments",
      },
    });
    // Return order as-is if enrichment fails
    return order;
  }
}

/**
 * Get customer and their orders by email address
 * This is the main function used by the tRPC router
 * @param email - Customer email address
 * @returns ShopifyOrdersResponse with customer info and orders
 */
export async function getCustomerOrdersByEmail(email: string): Promise<ShopifyOrdersResponse> {
  try {
    // First, search for the customer
    const customer = await searchCustomerByEmail(email);

    if (!customer) {
      return {
        customer: null,
        orders: [],
      };
    }

    // Then fetch their orders
    const orders = await getCustomerOrders(customer.id);

    // Enrich orders with fulfillment data (including delivery dates)
    const enrichedOrders = await Promise.all(orders.map((order) => enrichOrderWithFulfillments(order)));

    // Add admin URLs to each order (server-side only)
    const ordersWithUrls = enrichedOrders.map((order) => ({
      ...order,
      admin_url: getShopifyOrderUrl(order.id),
    }));

    return {
      customer,
      orders: ordersWithUrls,
    };
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        email,
        operation: "getCustomerOrdersByEmail",
      },
    });

    // Re-throw the error so the tRPC router can handle it
    throw error;
  }
}

/**
 * Search for an order by order name (e.g., "#1001") or order number
 * @param orderName - Order name (with or without #) or order number
 * @returns ShopifyOrder with customer info or null if not found
 */
export async function searchOrderByName(orderName: string): Promise<ShopifyOrdersResponse> {
  try {
    // Clean the order name - remove # if present
    const cleanName = orderName.trim().replace(/^#/, "");

    // Search for the order by name
    const response = await shopifyRequest<{ orders: ShopifyOrder[] }>(
      `/orders.json?status=any&limit=1&name=${cleanName}`,
    );

    if (response.orders && response.orders.length > 0) {
      const order = response.orders[0]!;

      // Enrich order with fulfillment data
      const enrichedOrder = await enrichOrderWithFulfillments(order);

      // Add admin URL to the order
      const orderWithUrl: ShopifyOrderWithUrl = {
        ...enrichedOrder,
        admin_url: getShopifyOrderUrl(enrichedOrder.id),
      };

      // Construct a minimal customer object from the order's customer data
      const customer: ShopifyCustomer = {
        id: order.customer.id,
        email: order.customer.email,
        first_name: order.customer.first_name,
        last_name: order.customer.last_name,
        orders_count: 1,
        total_spent: order.total_price,
        created_at: order.created_at,
        updated_at: order.updated_at,
      };

      return {
        customer,
        orders: [orderWithUrl],
      };
    }

    return {
      customer: null,
      orders: [],
    };
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        orderName,
        operation: "searchOrderByName",
      },
    });
    throw error;
  }
}

const MAX_TRACKING_SEARCH_PAGES = 4;
const TRACKING_SEARCH_PAGE_SIZE = 50;

export async function searchOrdersByTrackingNumber(trackingNumber: string): Promise<ShopifyOrdersResponse> {
  try {
    const normalizedTrackingNumber = trackingNumber.trim().replace(/\s+/g, "").toUpperCase();
    let sinceId: number | null = null;

    for (let page = 0; page < MAX_TRACKING_SEARCH_PAGES; page++) {
      const response = await shopifyRequest<ShopifyCustomerOrdersApiResponse>(
        `/orders.json?status=any&limit=${TRACKING_SEARCH_PAGE_SIZE}${sinceId ? `&since_id=${sinceId}` : ""}`,
      );
      const orders = response.orders || [];
      if (!orders.length) break;

      for (const order of orders) {
        const fulfillments = await getOrderFulfillments(order.id);
        const matchingFulfillments = fulfillments.filter((fulfillment) =>
          [fulfillment.tracking_number, ...fulfillment.tracking_numbers]
            .filter((value): value is string => Boolean(value))
            .map((value) => value.trim().replace(/\s+/g, "").toUpperCase())
            .includes(normalizedTrackingNumber),
        );

        if (!matchingFulfillments.length) continue;

        const enrichedFulfillments = await Promise.all(
          matchingFulfillments.map((fulfillment) => enrichFulfillmentWithEvents(fulfillment, order.id)),
        );

        const orderWithUrl: ShopifyOrderWithUrl = {
          ...order,
          fulfillments: enrichedFulfillments,
          admin_url: getShopifyOrderUrl(order.id),
        };

        const customer: ShopifyCustomer = {
          id: order.customer.id,
          email: order.customer.email,
          first_name: order.customer.first_name,
          last_name: order.customer.last_name,
          orders_count: 1,
          total_spent: order.total_price,
          created_at: order.created_at,
          updated_at: order.updated_at,
        };

        return {
          customer,
          orders: [orderWithUrl],
        };
      }

      sinceId = orders[orders.length - 1]?.id ?? null;
      if (!sinceId) break;
    }

    return {
      customer: null,
      orders: [],
    };
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        trackingNumber,
        operation: "searchOrdersByTrackingNumber",
      },
    });
    throw error;
  }
}

/**
 * Get the Shopify admin URL for an order
 * @param orderId - Shopify order ID
 * @returns URL to view the order in Shopify admin
 */
export function getShopifyOrderUrl(orderId: number): string {
  const domain = env.SHOPIFY_SHOP_DOMAIN;
  return `https://${domain}/admin/orders/${orderId}`;
}

/**
 * Extract order numbers from text
 * Looks for patterns like: #1234, 1234, order 1234, order #1234
 * @param text - Text to extract order numbers from
 * @returns Array of extracted order numbers (without # prefix)
 */
export function extractOrderNumbers(text: string): string[] {
  const orderNumbers = new Set<string>();

  // Pattern 1: #1234 (with hash)
  const hashPattern = /#(\d{3,})/gi;
  let match;
  while ((match = hashPattern.exec(text)) !== null) {
    if (match[1]) orderNumbers.add(match[1]);
  }

  // Pattern 2: "order 1234" or "order #1234" (case insensitive)
  const orderWordPattern = /order\s*#?(\d{3,})/gi;
  while ((match = orderWordPattern.exec(text)) !== null) {
    if (match[1]) orderNumbers.add(match[1]);
  }

  // Pattern 3: standalone numbers that look like order numbers (3+ digits)
  // Only if preceded by common keywords
  const contextPattern = /(purchase|tracking|shipment|delivery)\s*#?(\d{3,})/gi;
  while ((match = contextPattern.exec(text)) !== null) {
    if (match[2]) orderNumbers.add(match[2]);
  }

  return Array.from(orderNumbers);
}
