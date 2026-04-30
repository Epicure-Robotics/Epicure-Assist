import { env } from "@/lib/env";
import { captureExceptionAndLog } from "@/lib/shared/sentry";

const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Get the API base URL based on the key type
 * V2 secret keys (sk_) use v1 endpoint but with different auth
 * Public keys use v1 endpoint
 */
function getApiBase(): string {
  return "https://api.revenuecat.com/v1";
}

/**
 * Check if RevenueCat is configured
 */
export function isRevenueCatConfigured(): boolean {
  return !!env.REVENUECAT_API_KEY;
}

interface RevenueCatSubscriber {
  request_date: string;
  subscriber: {
    entitlements: Record<
      string,
      {
        expires_date: string | null;
        product_identifier: string;
        purchase_date: string;
      }
    >;
    subscriptions: Record<
      string,
      {
        expires_date: string | null;
        purchase_date: string;
        billing_issues_detected_at: string | null;
        is_sandbox: boolean;
        original_purchase_date: string;
        period_type: "trial" | "normal" | "intro";
        store: "app_store" | "play_store" | "stripe" | "promotional";
        unsubscribe_detected_at: string | null;
      }
    >;
  };
}

/**
 * Get subscriber info from RevenueCat
 */
async function getSubscriber(userId: string): Promise<RevenueCatSubscriber | null> {
  if (!isRevenueCatConfigured()) {
    throw new Error("RevenueCat API key not configured");
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const apiKey = env.REVENUECAT_API_KEY!;
    const apiKeyPrefix = apiKey.substring(0, 10);

    console.log(`[RevenueCat] Fetching subscriber: ${userId} (using key: ${apiKeyPrefix}...)`);

    // Public API keys use Bearer authentication
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Platform": "server",
    };

    const response = await fetch(`${getApiBase()}/subscribers/${encodeURIComponent(userId)}`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 404) {
      // User not found in RevenueCat
      return null;
    }

    if (!response.ok) {
      let errorMessage = `RevenueCat API error: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.text();
        if (errorBody) {
          errorMessage += ` - ${errorBody}`;
        }
      } catch {
        // Ignore error reading body
      }
      throw new Error(errorMessage);
    }

    const data = (await response.json()) as RevenueCatSubscriber;

    // Log the full response for debugging
    console.log(`[RevenueCat] Subscriber data for ${userId}:`, JSON.stringify(data, null, 2));

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("RevenueCat API request timed out");
    }
    throw error;
  }
}

/**
 * Check if user has a manually assigned (custom) entitlement
 * This indicates they have a subscription that was granted outside of store purchases
 *
 * A manual entitlement is one that exists WITHOUT a corresponding store subscription
 * (e.g., granted by admin through RevenueCat dashboard)
 */
function hasManualEntitlement(subscriber: RevenueCatSubscriber): boolean {
  const entitlements = subscriber.subscriber.entitlements;
  const subscriptions = subscriber.subscriber.subscriptions;

  // Get all active store subscriptions
  const activeStoreSubscriptions = new Set<string>();
  const now = new Date();

  for (const [productId, subscription] of Object.entries(subscriptions)) {
    const isFromStore = subscription.store === "app_store" || subscription.store === "play_store";
    const isActive = !subscription.expires_date || new Date(subscription.expires_date) > now;

    if (isFromStore && isActive) {
      activeStoreSubscriptions.add(productId);
    }
  }

  // Check if there are any active entitlements that DON'T come from a store subscription
  for (const [_key, entitlement] of Object.entries(entitlements)) {
    const isActive = !entitlement.expires_date || new Date(entitlement.expires_date) > now;

    if (isActive) {
      // Check if this entitlement's product is NOT in our active store subscriptions
      // If it's not from a store subscription, it's a manual/promotional entitlement
      if (!activeStoreSubscriptions.has(entitlement.product_identifier)) {
        console.log(`[RevenueCat] Found manual entitlement: ${entitlement.product_identifier}`);
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if user has an active store subscription (App Store or Play Store)
 */
function hasStoreSubscription(subscriber: RevenueCatSubscriber): boolean {
  const subscriptions = subscriber.subscriber.subscriptions;

  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const [_key, subscription] of Object.entries(subscriptions)) {
    // Check if it's from a store (not promotional)
    const isFromStore = subscription.store === "app_store" || subscription.store === "play_store";

    // Check if it's active (expires in the future or no expiry)
    const isActive = !subscription.expires_date || new Date(subscription.expires_date) > now;

    if (isFromStore && isActive) {
      console.log(`[RevenueCat] Found active store subscription: ${_key} (${subscription.store})`);
      return true;
    }
  }

  return false;
}

/**
 * Check if user has an active promotional subscription
 */
function hasPromotionalSubscription(subscriber: RevenueCatSubscriber): boolean {
  const subscriptions = subscriber.subscriber.subscriptions;

  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const [_key, subscription] of Object.entries(subscriptions)) {
    // Check if it's promotional
    const isPromotional = subscription.store === "promotional";

    // Check if it's active (expires in the future or no expiry)
    const isActive = !subscription.expires_date || new Date(subscription.expires_date) > now;

    if (isPromotional && isActive) {
      console.log(`[RevenueCat] Found active promotional subscription: ${_key}`);
      return true;
    }
  }

  return false;
}

/**
 * Get detailed subscription info for debugging
 */
export async function getSubscriptionDetails(userId: string): Promise<{
  hasManualEntitlement: boolean;
  hasStoreSubscription: boolean;
  hasPromotionalSubscription: boolean;
  hasDuplicate: boolean;
  entitlements: string[];
  subscriptions: string[];
} | null> {
  if (!isRevenueCatConfigured()) {
    return null;
  }

  try {
    const subscriber = await getSubscriber(userId);

    if (!subscriber) {
      return null;
    }

    const hasManual = hasManualEntitlement(subscriber);
    const hasStore = hasStoreSubscription(subscriber);
    const hasPromo = hasPromotionalSubscription(subscriber);

    return {
      hasManualEntitlement: hasManual,
      hasStoreSubscription: hasStore,
      hasPromotionalSubscription: hasPromo,
      hasDuplicate: hasPromo && hasStore,
      entitlements: Object.keys(subscriber.subscriber.entitlements),
      subscriptions: Object.keys(subscriber.subscriber.subscriptions),
    };
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        userId,
        operation: "getSubscriptionDetails",
      },
    });
    return null;
  }
}
