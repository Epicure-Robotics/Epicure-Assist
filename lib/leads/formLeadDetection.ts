/**
 * Website contact notifications are typically sent From: the support mailbox (e.g. connect@epicurerobotics.com)
 * with a distinctive Subject. Adjust matchers if your site changes notification copy.
 */
export function isWebsiteFormNotificationSubject(subject: string | undefined): boolean {
  if (!subject?.trim()) return false;
  const s = subject.toLowerCase();
  return (
    s.includes("new lead") ||
    s.includes("business inquiry") ||
    s.includes("new business inquiry") ||
    s.includes("contact form") ||
    s.includes("website inquiry") ||
    s.includes("web inquiry")
  );
}

export function isFormLeadMessage(params: {
  subject: string | undefined;
  fromAddress: string;
  mailboxAddress: string;
}): boolean {
  return (
    isWebsiteFormNotificationSubject(params.subject) &&
    params.fromAddress.toLowerCase() === params.mailboxAddress.toLowerCase()
  );
}
