import { mailboxes } from "@/db/schema";
import { runAIQuery } from "./ai";
import { MINI_MODEL } from "./ai/core";

const examples: [email: string, keywords: string][] = [
  [
    "Email: Delete my email from your files\n\nHi, Can you please delete my email address from your website and all newsletters. Thank you.",
    "delete email",
  ],
  [
    "Email: We have recently had people say checkout is adding a \"Tip\" but they can't remove it. We didn't add this as a feature we have had hundreds of people buy it without a tip, it just started showing up. Is there a reason this is happening!",
    "checkout tip feature",
  ],
  ["Email: Refund\n\nI need to get refund for this transaction, it was by mistake.", "refund transaction"],
  [
    "Email: Parts not showing on dealer portal\n\nHello, I published new spare parts but they do not appear for our territory. Can you check permissions? Thanks, Charlie",
    "dealer portal parts",
  ],
  [
    "Email: RE: Invoice INV-2041\nAn additional $0.50 showed on the card statement—that was not on our quote. Could support confirm if that is a processor fee? Regards, David",
    "additional charge",
  ],
  [
    "Email: Re: New tender offer available\n\nyour site barely works. The tender page is just blank. Is there supposed to be something to click on?",
    "tender offer blank",
  ],
  [
    "Email: Re: Regarding your Epicure account\n\nHi I'm replying to the hold on our account. What's the reason? Regards Nathan\n-- Original message --\nHi, We apologize for the inconvenience, but we noticed certain behaviors that indicate possible violations of our Terms of Service.",
    "Epicure account hold",
  ],
];

export const emailKeywordsExtractor = async (params: {
  mailbox: typeof mailboxes.$inferSelect;
  subject: string;
  body: string;
}): Promise<string[]> => {
  const content = (
    await runAIQuery({
      system: [
        "Generate a space-delimited list of 1-3 keywords taken directly from the user email. Do not respond with anything else.",
        "Examples:",
        examples.map(([email, keywords]) => `${email}\n${keywords}`).join("\n\n"),
      ].join("\n\n"),
      mailbox: params.mailbox,
      temperature: 0,
      messages: [{ role: "user", content: `${params.subject}\n\n${params.body}` }],
      queryType: "email_keywords_extractor",
      model: MINI_MODEL,
      functionId: "email-keywords-extractor",
      maxTokens: 500,
    })
  ).text;

  return content
    .trim()
    .toLowerCase()
    .replace(/^"(.*)"$/, "$1")
    .split(/\s+/)
    .filter(Boolean)
    .toSorted();
};
