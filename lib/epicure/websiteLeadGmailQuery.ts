/**
 * Gmail `q` fragment appended by `importGmailThreads` after the time window (see jobs/importGmailThreads.ts).
 * Narrows backlog import to likely website notification threads. Live delivery still relies on
 * `lib/leads/formLeadDetection.ts` + handleGmailWebhookEvent.
 *
 * Gmail OR syntax: https://support.google.com/mail/answer/7190
 */
export const EPICURE_WEBSITE_LEADS_GMAIL_QUERY_SUFFIX =
  '(subject:"New Lead" OR subject:"Business Inquiry" OR subject:"New Business Inquiry" OR subject:"Contact form" OR subject:"Website inquiry" OR subject:"Web inquiry")';
