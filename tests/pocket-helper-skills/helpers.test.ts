import { expect, test } from "vitest";
import { normalizeEscapedMultilineArg } from "@/pocket-helper-skills/scripts/_helpers";

test("normalizeEscapedMultilineArg converts escaped newlines and tabs when passed as a single CLI string", () => {
  expect(normalizeEscapedMultilineArg("Hi Mike,\\n\\nThanks for reaching out.\\n\\tPocket team")).toBe(
    "Hi Mike,\n\nThanks for reaching out.\n\tPocket team",
  );
});

test("normalizeEscapedMultilineArg leaves already-multiline strings unchanged", () => {
  expect(normalizeEscapedMultilineArg("Hi Mike,\n\nThanks for reaching out.")).toBe(
    "Hi Mike,\n\nThanks for reaching out.",
  );
});
