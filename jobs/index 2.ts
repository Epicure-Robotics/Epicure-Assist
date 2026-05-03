import { archiveGmailThreadJob } from "./archiveGmailThread";
import { autoAssignConversation } from "./autoAssignConversation";
import { closeInactiveConversations, closeInactiveConversationsForMailbox } from "./autoCloseInactiveConversations";
import { autoFollowUpTickets } from "./autoFollowUpTickets";
import { bulkEmbeddingClosedConversations } from "./bulkEmbeddingClosedConversations";
import { bulkForwardConversations } from "./bulkForwardConversations";
import { bulkUpdateConversations } from "./bulkUpdateConversations";
import { categorizeConversationToIssueGroup } from "./categorizeConversationToIssueGroup";
import { categorizeConversationToIssueSubgroup } from "./categorizeConversationToIssueSubgroup";
import { checkAssignedTicketResponseTimes } from "./checkAssignedTicketResponseTimes";
import { checkConditionTemplates } from "./checkConditionTemplates";
import { checkStaleJobs } from "./checkStaleJobs";
import { checkVipResponseTimes } from "./checkVipResponseTimes";
import { cleanupDanglingFiles } from "./cleanupDanglingFiles";
import { cleanupIssueSubgroups } from "./cleanupIssueSubgroups";
import { crawlWebsite } from "./crawlWebsite";
import { createWebNotificationForAssignee } from "./createWebNotificationForAssignee";
import { embeddingConversation } from "./embeddingConversation";
import { generateBackgroundDraft } from "./generateBackgroundDraft";
import { embeddingFaq } from "./embeddingFaq";
import { extractFaqsFromConversation } from "./extractFaqsFromConversation";
import { generateConversationSummaryEmbeddings } from "./generateConversationSummaryEmbeddings";
import { generateDailyReports, generateMailboxDailyReport } from "./generateDailyReports";
import { generateFilePreview } from "./generateFilePreview";
import { generateMailboxWeeklyReport, generateWeeklyReports } from "./generateWeeklyReports";
import { handleAutoResponse } from "./handleAutoResponse";
import { handleGmailWebhookEvent } from "./handleGmailWebhookEvent";
import { handleSlackAgentMessage } from "./handleSlackAgentMessage";
import { handleTemplateResponse } from "./handleTemplateResponse";
import { importGmailThreads } from "./importGmailThreads";
import { importRecentGmailThreads } from "./importRecentGmailThreads";
import { indexConversationMessage } from "./indexConversation";
import { logKnowledgeGap } from "./logKnowledgeGap";
import { notifyVipMessage } from "./notifyVipMessage";
import { postConversationFollowUpToSlackThread } from "./postConversationFollowUpToSlackThread";
import { postEmailToGmail } from "./postEmailToGmail";
import { postInternalNoteToSlack } from "./postInternalNoteToSlack";
import { publishNewMessageEvent } from "./publishNewMessageEvent";
import { publishRequestHumanSupport } from "./publishRequestHumanSupport";
import { renewMailboxWatches } from "./renewMailboxWatches";
import { scheduledWebsiteCrawl } from "./scheduledWebsiteCrawl";
import { sendAssignmentEmail } from "./sendAssignmentEmail";
import { sendClosedThreadEmail } from "./sendClosedThreadEmail";
import { sendFollowerNotification } from "./sendFollowerNotification";
import { suggestKnowledgeBankChanges } from "./suggestKnowledgeBankChanges";
import { suggestKnowledgeBankFromEditedDraft } from "./suggestKnowledgeBankFromEditedDraft";
import { updateSuggestedActions } from "./updateSuggestedActions";

// Linked to events in trigger.ts
export const eventJobs = {
  generateFilePreview,
  embeddingConversation,
  indexConversationMessage,
  generateConversationSummaryEmbeddings,

  publishNewMessageEvent,
  notifyVipMessage,
  postConversationFollowUpToSlackThread,
  postEmailToGmail,
  handleAutoResponse,
  bulkUpdateConversations,
  bulkForwardConversations,
  updateSuggestedActions,
  handleGmailWebhookEvent,
  embeddingFaq,
  generateBackgroundDraft,
  importRecentGmailThreads,
  importGmailThreads,
  generateMailboxWeeklyReport,
  generateMailboxDailyReport,
  crawlWebsite,
  suggestKnowledgeBankChanges,
  suggestKnowledgeBankFromEditedDraft,
  extractFaqsFromConversation,
  logKnowledgeGap,
  closeInactiveConversations,
  closeInactiveConversationsForMailbox,
  autoFollowUpTickets,
  autoAssignConversation,
  categorizeConversationToIssueGroup,
  categorizeConversationToIssueSubgroup,
  publishRequestHumanSupport,
  handleSlackAgentMessage,
  sendFollowerNotification,
  sendAssignmentEmail,
  createWebNotificationForAssignee,
  archiveGmailThreadJob,
  sendClosedThreadEmail,
  postInternalNoteToSlack,
  checkConditionTemplates,
  handleTemplateResponse,
};

export const cronJobs = {
  "*/5 * * * *": { checkStaleJobs },
  "0 19 * * *": { bulkEmbeddingClosedConversations },
  "0 2 * * *": { autoFollowUpTickets },
  "0 * * * *": {
    cleanupDanglingFiles,
    closeInactiveConversations,
  },
  "0 3 * * 0": { cleanupIssueSubgroups },
  "0 14 * * 1-5": {
    checkAssignedTicketResponseTimes,
    checkVipResponseTimes,
  },
  "0 0 * * *": { renewMailboxWatches },
  "0 0 * * 0": { scheduledWebsiteCrawl },
  "30 16 * * *": { generateDailyReports },
  "30 2 * * 0": { generateWeeklyReports },
};
