import { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { conversationEvents, conversations } from "@/db/schema";
import {
  deletePocketUserDevice,
  getPocketUserByEmail,
  isPocketConfigured,
  syncPocketUserSubscription,
  updatePocketUserSubscription,
} from "@/lib/pocket/client";
import { PocketApiError } from "@/lib/pocket/types";
import { captureExceptionAndLog } from "@/lib/shared/sentry";
import { mailboxProcedure } from "./procedure";

export const pocketRouter = {
  getUserInfo: mailboxProcedure
    .input(
      z.object({
        email: z.string().email(),
      }),
    )
    .query(async ({ input }) => {
      // Check if Pocket is configured
      if (!isPocketConfigured()) {
        return {
          configured: false,
          user: null,
          found: false,
          error: null,
        };
      }

      try {
        const { user, found } = await getPocketUserByEmail(input.email);

        return {
          configured: true,
          user,
          found,
          error: null,
        };
      } catch (error) {
        // Log the error but return a graceful response
        captureExceptionAndLog(error, {
          extra: {
            email: input.email,
            operation: "pocket.getUserInfo",
          },
        });

        // Return user-friendly error message
        let errorMessage = "Failed to fetch Pocket user information";

        if (error instanceof PocketApiError) {
          if (error.code === "CONNECTION_ERROR") {
            errorMessage = "Could not connect to Pocket database";
          } else if (error.code === "TIMEOUT") {
            errorMessage = "Pocket database query timed out";
          } else if (error.code === "TABLE_NOT_FOUND") {
            errorMessage = "Users table not found in Pocket database";
          } else {
            errorMessage = error.message;
          }
        }

        return {
          configured: true,
          user: null,
          found: false,
          error: errorMessage,
        };
      }
    }),

  updateUserSubscription: mailboxProcedure
    .input(
      z.object({
        userId: z.string(),
        subscriptionType: z.enum(["new_member", "founding_member", "black_friday_member"]),
      }),
    )
    .mutation(async ({ input }) => {
      // Check if Pocket is configured
      if (!isPocketConfigured()) {
        throw new Error("Pocket database is not configured");
      }

      try {
        const user = await updatePocketUserSubscription(input.userId, input.subscriptionType);

        if (!user) {
          throw new Error("User not found");
        }

        return {
          success: true,
          user,
        };
      } catch (error) {
        // Log the error
        captureExceptionAndLog(error, {
          extra: {
            userId: input.userId,
            subscriptionType: input.subscriptionType,
            operation: "pocket.updateUserSubscription",
          },
        });

        // Return user-friendly error message
        let errorMessage = "Failed to update user subscription";

        if (error instanceof PocketApiError) {
          if (error.code === "CONNECTION_ERROR") {
            errorMessage = "Could not connect to Pocket database";
          } else if (error.code === "TIMEOUT") {
            errorMessage = "Pocket database query timed out";
          } else {
            errorMessage = error.message;
          }
        }

        throw new Error(errorMessage);
      }
    }),

  deleteUserDevice: mailboxProcedure
    .input(
      z.object({
        userId: z.string(),
        deviceId: z.string(),
        conversationId: z.number(),
        modelString: z.string().optional(),
        serialNumber: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!isPocketConfigured()) {
        throw new Error("Pocket database is not configured");
      }

      try {
        const deleted = await deletePocketUserDevice(input.userId, input.deviceId);

        if (!deleted) {
          throw new Error("Device not found");
        }

        const conversation = await db.query.conversations.findFirst({
          where: and(eq(conversations.id, input.conversationId), eq(conversations.unused_mailboxId, ctx.mailbox.id)),
          columns: { id: true },
        });

        if (conversation) {
          const reasonParts = [
            input.modelString?.trim() ? `model: ${input.modelString.trim()}` : null,
            input.serialNumber?.trim() ? `serial: ${input.serialNumber.trim()}` : null,
            `device_id: ${input.deviceId}`,
            `pocket_user_id: ${input.userId}`,
          ].filter(Boolean);

          await db.insert(conversationEvents).values({
            conversationId: conversation.id,
            type: "device_deleted",
            changes: {},
            byUserId: ctx.user.id,
            reason: reasonParts.join(" | "),
          });
        }

        return {
          success: true,
        };
      } catch (error) {
        captureExceptionAndLog(error, {
          extra: {
            userId: input.userId,
            deviceId: input.deviceId,
            operation: "pocket.deleteUserDevice",
          },
        });

        let errorMessage = "Failed to delete user device";

        if (error instanceof PocketApiError) {
          if (error.code === "CONNECTION_ERROR") {
            errorMessage = "Could not connect to Pocket database";
          } else if (error.code === "TIMEOUT") {
            errorMessage = "Pocket database query timed out";
          } else {
            errorMessage = error.message;
          }
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        throw new Error(errorMessage);
      }
    }),

  syncUserSubscription: mailboxProcedure
    .input(
      z.object({
        userId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const success = await syncPocketUserSubscription(input.userId);

        return {
          success,
        };
      } catch (error) {
        captureExceptionAndLog(error, {
          extra: {
            userId: input.userId,
            operation: "pocket.syncUserSubscription",
          },
        });

        let errorMessage = "Failed to sync user subscription";

        if (error instanceof PocketApiError) {
          errorMessage = error.message;
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        throw new Error(errorMessage);
      }
    }),
} satisfies TRPCRouterRecord;
