import { describe, expect, it } from "vitest";
import { cosineSimilarity, normalizeIssueSubgroupTitle } from "@/lib/ai/issueSubgroups";

describe("normalizeIssueSubgroupTitle", () => {
  it("normalizes case, punctuation, and spacing", () => {
    expect(normalizeIssueSubgroupTitle("  Audio Issues!!! ")).toBe("audio issue");
  });

  it("singularizes common plural endings", () => {
    expect(normalizeIssueSubgroupTitle("Sync Issues and Bugs")).toBe("sync issue and bug");
    expect(normalizeIssueSubgroupTitle("Policies")).toBe("policy");
  });

  it("falls back to general for empty labels", () => {
    expect(normalizeIssueSubgroupTitle("   ")).toBe("general");
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBe(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
});
