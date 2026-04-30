import { eq } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/db/client";
import {
  conversationMessages,
  conversations,
  notes,
  pushSubscriptions,
  userProfiles,
  webNotifications,
  type WebNotificationType,
} from "@/db/schema";
import { env } from "@/lib/env";
import { publishToRealtime } from "@/lib/realtime/publish";
import { captureExceptionAndLog } from "@/lib/shared/sentry";
import { getLatestBotMessageInDM, getSlackUsersByEmail, sendSlackDM } from "@/lib/slack/client";

type CreateWebNotificationPayload = {
  conversationId: number;
  type: WebNotificationType;
  messageId?: number;
  noteId?: number;
  triggeredByUserId?: string;
};

export const createWebNotificationForAssignee = async (payload: CreateWebNotificationPayload) => {
  try {
    const { conversationId, type, messageId, noteId, triggeredByUserId } = payload;

    console.log("[createWebNotificationForAssignee] Starting with payload:", JSON.stringify(payload));

    if (!conversationId || !type) {
      console.log("[createWebNotificationForAssignee] Missing required fields");
      return { success: false, reason: "Missing required fields" };
    }

    // Fetch conversation with assignee info
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      columns: {
        id: true,
        slug: true,
        subject: true,
        emailFrom: true,
        assignedToId: true,
      },
    });

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // No assignee = no notification
    if (!conversation.assignedToId) {
      console.log("[createWebNotificationForAssignee] No assignee, skipping notification");
      return { success: false, reason: "No assignee" };
    }

    // Don't notify if the assignee triggered the event themselves
    if (conversation.assignedToId === triggeredByUserId) {
      console.log("[createWebNotificationForAssignee] Assignee triggered event, skipping notification");
      return { success: false, reason: "Assignee triggered the event" };
    }

    // Check user notification preferences
    const assignee = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.id, conversation.assignedToId),
      columns: {
        id: true,
        displayName: true,
        preferences: true,
      },
      with: {
        user: {
          columns: {
            email: true,
          },
        },
      },
    });

    if (!assignee) {
      console.log("[createWebNotificationForAssignee] Assignee not found");
      return { success: false, reason: "Assignee not found" };
    }

    console.log("[createWebNotificationForAssignee] Assignee:", assignee.displayName, assignee.id);

    // Check notification preferences (default is OFF for all notifications)
    const prefs = assignee.preferences as any;
    const notificationPrefs = prefs?.notifications || {};

    console.log("[createWebNotificationForAssignee] Notification preferences:", JSON.stringify(notificationPrefs));

    // Only send notifications if explicitly enabled by the user
    if (type === "new_message" && notificationPrefs.notifyOnNewMessage !== true) {
      console.log("[createWebNotificationForAssignee] User has not enabled new message notifications");
      return { success: false, reason: "User has not enabled new message notifications" };
    }
    if (type === "assignment_change" && notificationPrefs.notifyOnAssignment !== true) {
      console.log("[createWebNotificationForAssignee] User has not enabled assignment notifications");
      return { success: false, reason: "User has not enabled assignment notifications" };
    }
    if (type === "internal_note" && notificationPrefs.notifyOnNote !== true) {
      console.log("[createWebNotificationForAssignee] User has not enabled note notifications");
      return { success: false, reason: "User has not enabled note notifications" };
    }

    // Fetch additional content for Slack (message body or note body)
    let additionalContent = "";
    if (messageId) {
      const message = await db.query.conversationMessages.findFirst({
        where: eq(conversationMessages.id, messageId),
        columns: { body: true, cleanedUpText: true },
      });
      additionalContent = message?.cleanedUpText || message?.body || "";
      // Strip HTML tags if cleanedUpText is missing and body has HTML (basic check)
      if (!message?.cleanedUpText && additionalContent.includes("<")) {
        // simple strip tags for safety, though body should be text mostly unless specified
        additionalContent = additionalContent.replace(/<[^>]*>?/gm, "");
      }
    } else if (noteId) {
      const note = await db.query.notes.findFirst({
        where: eq(notes.id, noteId),
        columns: { body: true },
      });
      additionalContent = note?.body || "";
    }

    // Generate notification content
    const { title, body } = generateNotificationContent(type, conversation);
    const actionUrl = `${env.AUTH_URL}/conversations?id=${conversation.slug}`;

    // Create notification record
    const [notification] = await db
      .insert(webNotifications)
      .values({
        userId: conversation.assignedToId,
        conversationId: conversation.id,
        messageId,
        noteId,
        type,
        title,
        body,
        actionUrl,
        sentAt: new Date(),
      })
      .returning();

    if (!notification) {
      throw new Error("Failed to create notification");
    }

    console.log("[createWebNotificationForAssignee] Created notification record:", notification.id);

    // Publish to realtime channel for in-app notifications
    try {
      console.log("[createWebNotificationForAssignee] Publishing to realtime channel");
      await publishToRealtime({
        channel: { name: `user-notifications-${conversation.assignedToId}`, private: true },
        event: "notification.created",
        data: notification,
      });
      console.log("[createWebNotificationForAssignee] Successfully published to realtime");
    } catch (error) {
      console.error("[createWebNotificationForAssignee] Failed to publish to realtime:", error);
      captureExceptionAndLog(error);
      // Don't fail the entire job if realtime publish fails
    }

    // Send push notifications to all user's subscribed devices
    if (env.VAPID_PRIVATE_KEY && env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && notificationPrefs.webPushEnabled === true) {
      try {
        console.log("[createWebNotificationForAssignee] VAPID keys configured, sending push notifications");

        // Ensure VAPID_MAILTO has mailto: prefix
        const vapidMailto = env.VAPID_MAILTO
          ? env.VAPID_MAILTO.startsWith("mailto:")
            ? env.VAPID_MAILTO
            : `mailto:${env.VAPID_MAILTO}`
          : `mailto:noreply@${new URL(env.AUTH_URL).hostname}`;

        webpush.setVapidDetails(vapidMailto, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

        const subscriptions = await db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, conversation.assignedToId));
        console.log("[createWebNotificationForAssignee] Found", subscriptions.length, "push subscription(s)");

        const pushPromises = subscriptions.map(async (subscription) => {
          try {
            console.log(
              "[createWebNotificationForAssignee] Sending push to:",
              `${subscription.endpoint.substring(0, 50)}...`,
            );
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: {
                  p256dh: subscription.p256dh,
                  auth: subscription.auth,
                },
              },
              JSON.stringify({
                title,
                body,
                conversationId: conversation.id,
                actionUrl,
                notificationId: notification.id,
              }),
            );
            console.log("[createWebNotificationForAssignee] Push sent successfully to subscription", subscription.id);

            // Update last used timestamp
            await db
              .update(pushSubscriptions)
              .set({ lastUsedAt: new Date() })
              .where(eq(pushSubscriptions.id, subscription.id));

            return { success: true, subscriptionId: subscription.id };
          } catch (error: any) {
            console.error(
              "[createWebNotificationForAssignee] Push failed for subscription",
              subscription.id,
              ":",
              error.message,
            );
            // Handle subscription errors (expired, invalid, etc.)
            if (error.statusCode === 404 || error.statusCode === 410) {
              // Subscription no longer valid - delete it
              console.log("[createWebNotificationForAssignee] Deleting expired subscription", subscription.id);
              await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
              return { success: false, subscriptionId: subscription.id, reason: "Subscription expired" };
            }
            captureExceptionAndLog(error);
            return { success: false, subscriptionId: subscription.id, error: error.message };
          }
        });

        const pushResults = await Promise.all(pushPromises);
        console.log("[createWebNotificationForAssignee] Push results:", JSON.stringify(pushResults));

        // Update deliveredAt timestamp if at least one push succeeded
        if (pushResults.some((r) => r.success)) {
          console.log("[createWebNotificationForAssignee] At least one push succeeded, updating deliveredAt");
          await db
            .update(webNotifications)
            .set({ deliveredAt: new Date() })
            .where(eq(webNotifications.id, notification.id));
        } else {
          console.log("[createWebNotificationForAssignee] All pushes failed");
        }
      } catch (error) {
        console.error("[createWebNotificationForAssignee] Error in push notification flow:", error);
        captureExceptionAndLog(error);
        // Continue to Slack DM even if push fails
      }
    } else {
      console.log(
        "[createWebNotificationForAssignee] Skipping push notifications. VAPID configured:",
        !!(env.VAPID_PRIVATE_KEY && env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
        "webPushEnabled:",
        notificationPrefs.webPushEnabled === true,
      );
    }

    // Send Slack DM notification if enabled
    if (notificationPrefs.slackDMEnabled === true) {
      try {
        console.log("[createWebNotificationForAssignee] Slack DM enabled, attempting to send");

        // Get the mailbox to check if Slack is connected
        const mailbox = await db.query.mailboxes.findFirst({
          columns: {
            slackBotToken: true,
            slackBotUserId: true,
          },
        });

        if (mailbox?.slackBotToken && mailbox.slackBotUserId && assignee.user?.email) {
          // Get the Slack user ID for the assignee
          const slackUsersByEmail = await getSlackUsersByEmail(mailbox.slackBotToken);
          const slackUserId = slackUsersByEmail.get(assignee.user.email);

          if (slackUserId) {
            console.log("[createWebNotificationForAssignee] Sending Slack DM to user:", slackUserId);

            const slackText = additionalContent
              ? `*${title}*\n${body}\n\n>${additionalContent.replace(/\n/g, "\n>")}\n\n<${actionUrl}|View Conversation>`
              : `*${title}*\n${body}\n\n<${actionUrl}|View Conversation>`;

            // First, send the message to get the channel ID (or we could open the channel first)
            // We'll open the channel, fetch history, then send threaded if possible
            const { WebClient } = await import("@slack/web-api");
            const client = new WebClient(mailbox.slackBotToken);

            // Open DM channel
            const openResponse = await client.conversations.open({
              users: slackUserId,
            });

            if (!openResponse.ok || !openResponse.channel?.id) {
              throw new Error(`Failed to open DM channel: ${openResponse.error}`);
            }

            const dmChannelId = openResponse.channel.id;

            // Try to find the latest bot message to use as a thread
            const latestThreadTs = await getLatestBotMessageInDM(
              mailbox.slackBotToken,
              dmChannelId,
              mailbox.slackBotUserId,
            );

            console.log(
              "[createWebNotificationForAssignee] Latest notification thread:",
              latestThreadTs ?? "none - will create new top-level message",
            );

            const result = await sendSlackDM(
              mailbox.slackBotToken,
              slackUserId,
              `${title}: ${body}`,
              [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: slackText,
                  },
                },
              ],
              latestThreadTs ?? undefined, // Send as threaded reply if we found a thread
            );

            if (result) {
              console.log(
                "[createWebNotificationForAssignee] Slack DM sent successfully:",
                result.messageTs,
                "in channel:",
                result.channelId,
              );
            } else {
              console.log("[createWebNotificationForAssignee] Failed to send Slack DM");
            }
          } else {
            console.log("[createWebNotificationForAssignee] Slack user not found for email:", assignee.user.email);
          }
        } else {
          console.log("[createWebNotificationForAssignee] Slack not connected or no email for assignee");
        }
      } catch (error) {
        console.error("[createWebNotificationForAssignee] Error sending Slack DM:", error);
        captureExceptionAndLog(error);
        // Don't fail the entire job if Slack DM fails
      }
    } else {
      console.log("[createWebNotificationForAssignee] Slack DM notifications not enabled for user");
    }

    // Return success (realtime notification was sent, plus any push/Slack notifications)
    return {
      success: true,
      notificationId: notification.id,
      reason: "Notifications sent successfully",
    };
  } catch (error) {
    console.error("[createWebNotificationForAssignee] Fatal error:", error);
    captureExceptionAndLog(error);
    throw error;
  }
};

function generateNotificationContent(
  type: WebNotificationType,
  conversation: { subject: string | null; emailFrom: string | null },
): { title: string; body: string } {
  const subject = conversation.subject || "Untitled Conversation";
  const customer = conversation.emailFrom || "A customer";

  switch (type) {
    case "new_message":
      return {
        title: "New message",
        body: `${customer} sent a new message in "${subject}"`,
      };
    case "assignment_change":
      return {
        title: "New assignment",
        body: `You've been assigned to "${subject}"`,
      };
    case "internal_note":
      return {
        title: "New note",
        body: `A teammate added a note to "${subject}"`,
      };
    default:
      return {
        title: "Notification",
        body: `Update in "${subject}"`,
      };
  }
}
