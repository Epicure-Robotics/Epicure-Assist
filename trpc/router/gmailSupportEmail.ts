import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { db } from "@/db/client";
import { processGmailThread } from "@/jobs/importRecentGmailThreads";
import { triggerEvent } from "@/jobs/trigger";
import { createGmailSupportEmail, deleteGmailSupportEmail, getGmailSupportEmail } from "@/lib/data/gmailSupportEmail";
import { env } from "@/lib/env";
import { getGmailService, subscribeToMailbox } from "@/lib/gmail/client";
import { mailboxProcedure } from "./mailbox";

export const gmailSupportEmailRouter = {
  get: mailboxProcedure.query(async ({ ctx }) => {
    if (!env.GOOGLE_CLIENT_ID) {
      return { enabled: false };
    }

    const gmailSupportEmail = await getGmailSupportEmail(ctx.mailbox);
    return {
      enabled: true,
      supportAccount: gmailSupportEmail
        ? {
            id: gmailSupportEmail.id,
            email: gmailSupportEmail.email,
            createdAt: gmailSupportEmail.createdAt,
          }
        : null,
    };
  }),

  create: mailboxProcedure
    .input(
      z.object({
        email: z.string().email(),
        accessToken: z.string(),
        refreshToken: z.string(),
        expiresAt: z.date(),
      }),
    )
    .mutation(async ({ input }) => {
      const { gmailSupportEmail } = await db.transaction(async (tx) => {
        const gmailSupportEmail = await createGmailSupportEmail(input, tx);
        const gmailService = getGmailService(gmailSupportEmail);
        await subscribeToMailbox(gmailService);
        return { gmailSupportEmail };
      });
      await triggerEvent("gmail/import-recent-threads", {
        gmailSupportEmailId: gmailSupportEmail.id,
      });
    }),
  delete: mailboxProcedure.mutation(async ({ ctx }) => {
    return await db.transaction(async (tx) => {
      const gmailSupportEmail = await getGmailSupportEmail(ctx.mailbox);
      if (!gmailSupportEmail) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Gmail support email not found" });
      }
      const gmailService = getGmailService(gmailSupportEmail);
      await gmailService.users.stop({ userId: "me" });
      await deleteGmailSupportEmail(tx, gmailSupportEmail.id);
      return { message: "Support email deleted successfully." };
    });
  }),

  searchThreads: mailboxProcedure
    .input(
      z.object({
        query: z.string().min(1, "Search query is required"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const gmailSupportEmail = await getGmailSupportEmail(ctx.mailbox);
      if (!gmailSupportEmail) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Gmail support email not found" });
      }

      const gmailService = getGmailService(gmailSupportEmail);
      const response = await gmailService.users.threads.list({
        userId: "me",
        q: input.query,
        maxResults: 10,
      });

      return {
        threads: (response.data.threads || []).map((thread) => ({
          id: thread.id!,
          snippet: thread.snippet || "",
        })),
      };
    }),

  importThread: mailboxProcedure
    .input(
      z.object({
        threadId: z.string().min(1, "Thread ID is required"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const gmailSupportEmail = await getGmailSupportEmail(ctx.mailbox);
      if (!gmailSupportEmail) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Gmail support email not found" });
      }

      try {
        // First, verify the thread exists and is accessible
        const gmailService = getGmailService(gmailSupportEmail);
        try {
          await gmailService.users.threads.get({
            userId: "me",
            id: input.threadId,
            format: "minimal",
          });
        } catch (gmailError: any) {
          console.error("Gmail API error:", gmailError);
          if (gmailError.code === 404) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Thread not found. Please verify the thread ID is correct and the email exists in ${gmailSupportEmail.email}`,
            });
          }
          if (gmailError.code === 400) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Invalid thread ID format. Gmail says: ${gmailError.message || "Invalid id value"}`,
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Gmail API error: ${gmailError.message || gmailError}`,
          });
        }

        const result = await processGmailThread(gmailSupportEmail.id, input.threadId, { status: "open" });

        return {
          success: true,
          conversationId: result.conversationId,
          conversationSlug: result.conversationSlug,
          message: "Email thread imported successfully",
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("Import thread error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to import thread",
        });
      }
    }),
} satisfies TRPCRouterRecord;
