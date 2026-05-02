import { htmlToText } from "html-to-text";

/**
 * Turns HTML bodies (e.g. Gmail) or plain strings into a single line of plain text.
 * Used for knowledge gaps, labels, and anywhere raw email HTML must not surface as tags.
 */
export function plainTextFromPossibleHtml(input: string): string {
  const raw = input?.trim() ?? "";
  if (!raw) return "";

  try {
    const text = htmlToText(raw, { wordwrap: false })
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return text.replace(/\s+/g, " ").trim();
  } catch {
    return raw
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}
