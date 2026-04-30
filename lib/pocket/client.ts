import { Client } from "pg";
import { env } from "@/lib/env";
import { captureExceptionAndLog } from "@/lib/shared/sentry";
import { PocketApiError, PocketDevice, PocketUser, PocketUserResponse } from "./types";

const POCKET_QUERY_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Check if Pocket integration is configured
 */
export function isPocketConfigured(): boolean {
  return !!env.POCKET_DB_URL;
}

/**
 * Create a PostgreSQL client for Pocket database
 */
function createPocketClient(): Client {
  if (!isPocketConfigured()) {
    throw new PocketApiError("Pocket database is not configured. Please set POCKET_DB_URL.");
  }

  return new Client({
    connectionString: env.POCKET_DB_URL,
    connectionTimeoutMillis: POCKET_QUERY_TIMEOUT_MS,
    query_timeout: POCKET_QUERY_TIMEOUT_MS,
  });
}

function mapDevice(row: Record<string, unknown>): PocketDevice {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    device_id: (row.device_id as string | null) ?? null,
    serial_number: (row.serial_number as string | null) ?? null,
    mac_address: (row.mac_address as string | null) ?? null,
    model_string: (row.model_string as string | null) ?? null,
    firmware_version: (row.firmware_version as string | null) ?? null,
    wifi_firmware_version: (row.wifi_firmware_version as string | null) ?? null,
    last_synced_file: (row.last_synced_file as string | null) ?? null,
    last_synced_folder: (row.last_synced_folder as string | null) ?? null,
    last_sync_time:
      row.last_sync_time instanceof Date
        ? row.last_sync_time.toISOString()
        : ((row.last_sync_time as string | null) ?? null),
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : ((row.created_at as string | null) ?? null),
    updated_at:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : ((row.updated_at as string | null) ?? null),
  };
}

/**
 * Search for a user by email address
 * @param email - User email address
 * @returns PocketUser or null if not found
 */
export async function searchPocketUserByEmail(email: string): Promise<PocketUser | null> {
  const client = createPocketClient();

  try {
    await client.connect();

    const query = `
      SELECT 
        id,
        email,
        display_name,
        subscription_type,
        onboarding_status,
        role,
        app_version,
        deleted_at,
        deletion_reason
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `;

    const result = await client.query(query, [email]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    const deviceQuery = `
      SELECT
        id,
        user_id,
        device_id,
        serial_number,
        mac_address,
        model_string,
        firmware_version,
        wifi_firmware_version,
        last_synced_file,
        last_synced_folder,
        last_sync_time,
        created_at,
        updated_at
      FROM devices
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    const devicesResult = await client.query(deviceQuery, [row.id]);

    // Convert dates to ISO strings and map only the fields we need
    const user: PocketUser = {
      id: row.id,
      email: row.email,
      display_name: row.display_name,
      subscription_type: row.subscription_type,
      onboarding_status: row.onboarding_status,
      role: row.role,
      app_version: row.app_version,
      deleted_at: row.deleted_at?.toISOString() ?? null,
      deletion_reason: row.deletion_reason,
      // Fields not queried but required by type
      is_active: true,
      profile_image_url: null,
      auth_provider: "",
      timezone: "UTC",
      created_at: "",
      updated_at: "",
      email_verified: false,
      email_verified_at: null,
      last_login_at: null,
      last_login_method: null,
      deleted_by: null,
      devices: devicesResult.rows.map(mapDevice),
    };

    return user;
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        email,
        operation: "searchPocketUserByEmail",
      },
    });

    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        throw new PocketApiError("Pocket database query timed out", "TIMEOUT");
      } else if (error.message.includes("connect")) {
        throw new PocketApiError("Failed to connect to Pocket database", "CONNECTION_ERROR");
      } else if (error.message.includes("relation") && error.message.includes("does not exist")) {
        throw new PocketApiError("Users table not found in Pocket database", "TABLE_NOT_FOUND");
      }
    }

    throw new PocketApiError("Failed to query Pocket database");
  } finally {
    await client.end();
  }
}

/**
 * Get user information by email address
 * This is the main function used by the tRPC router
 * @param email - User email address
 * @returns PocketUserResponse with user info
 */
export async function getPocketUserByEmail(email: string): Promise<PocketUserResponse> {
  try {
    const user = await searchPocketUserByEmail(email);

    return {
      user,
      found: user !== null,
    };
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        email,
        operation: "getPocketUserByEmail",
      },
    });

    // Re-throw the error so the tRPC router can handle it
    throw error;
  }
}

/**
 * Update user subscription type
 * @param userId - User ID
 * @param subscriptionType - New subscription type
 * @returns Updated PocketUser
 */
export async function updatePocketUserSubscription(
  userId: string,
  subscriptionType: string,
): Promise<PocketUser | null> {
  const client = createPocketClient();

  try {
    await client.connect();

    const query = `
      UPDATE users
      SET subscription_type = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        email,
        display_name,
        subscription_type,
        onboarding_status,
        role,
        app_version,
        deleted_at,
        deletion_reason
    `;

    const result = await client.query(query, [subscriptionType, userId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    const deviceQuery = `
      SELECT
        id,
        user_id,
        device_id,
        serial_number,
        mac_address,
        model_string,
        firmware_version,
        wifi_firmware_version,
        last_synced_file,
        last_synced_folder,
        last_sync_time,
        created_at,
        updated_at
      FROM devices
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    const devicesResult = await client.query(deviceQuery, [row.id]);

    // Convert dates to ISO strings and map only the fields we need
    const user: PocketUser = {
      id: row.id,
      email: row.email,
      display_name: row.display_name,
      subscription_type: row.subscription_type,
      onboarding_status: row.onboarding_status,
      role: row.role,
      app_version: row.app_version,
      deleted_at: row.deleted_at?.toISOString() ?? null,
      deletion_reason: row.deletion_reason,
      // Fields not queried but required by type
      is_active: true,
      profile_image_url: null,
      auth_provider: "",
      timezone: "UTC",
      created_at: "",
      updated_at: "",
      email_verified: false,
      email_verified_at: null,
      last_login_at: null,
      last_login_method: null,
      deleted_by: null,
      devices: devicesResult.rows.map(mapDevice),
    };

    return user;
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        userId,
        subscriptionType,
        operation: "updatePocketUserSubscription",
      },
    });

    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        throw new PocketApiError("Pocket database query timed out", "TIMEOUT");
      } else if (error.message.includes("connect")) {
        throw new PocketApiError("Failed to connect to Pocket database", "CONNECTION_ERROR");
      }
    }

    throw new PocketApiError("Failed to update Pocket user subscription");
  } finally {
    await client.end();
  }
}

/**
 * Delete a user's device
 * @param userId - User ID
 * @param deviceId - Device table row ID
 * @returns True when a row was deleted
 */
export async function deletePocketUserDevice(userId: string, deviceId: string): Promise<boolean> {
  const client = createPocketClient();

  try {
    await client.connect();

    const query = `
      DELETE FROM devices
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;

    const result = await client.query(query, [deviceId, userId]);
    return result.rows.length > 0;
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        userId,
        deviceId,
        operation: "deletePocketUserDevice",
      },
    });

    if (error instanceof Error) {
      if (error.message.includes("timeout")) {
        throw new PocketApiError("Pocket database query timed out", "TIMEOUT");
      } else if (error.message.includes("connect")) {
        throw new PocketApiError("Failed to connect to Pocket database", "CONNECTION_ERROR");
      }
    }

    throw new PocketApiError("Failed to delete Pocket device");
  } finally {
    await client.end();
  }
}

/**
 * Sync user subscription from RevenueCat via Pocket support API
 * @param userId - User ID
 * @returns True if sync was successful
 */
export async function syncPocketUserSubscription(userId: string): Promise<boolean> {
  const token = env.POCKET_SUPPORT_API_TOKEN;

  if (!token) {
    throw new PocketApiError("Pocket support API token is not configured. Please set POCKET_SUPPORT_API_TOKEN.");
  }

  try {
    const response = await fetch("https://production.heypocketai.com/api/v1/support/sync-user-subscription", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }

    return true;
  } catch (error) {
    captureExceptionAndLog(error, {
      extra: {
        userId,
        operation: "syncPocketUserSubscription",
      },
    });

    if (error instanceof Error) {
      throw new PocketApiError(`Failed to sync user subscription: ${error.message}`);
    }

    throw new PocketApiError("Failed to sync user subscription");
  }
}
