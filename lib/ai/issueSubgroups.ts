export const normalizeIssueSubgroupTitle = (title: string): string => {
  const cleaned = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "general";

  const singularized = cleaned
    .split(" ")
    .map((token) => {
      if (token.length <= 3) return token;
      if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
      if (token.endsWith("sses") || token.endsWith("xes")) return token.slice(0, -2);
      if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
      return token;
    })
    .join(" ");

  return singularized || "general";
};

export const issueSubgroupEmbeddingText = (title: string, description?: string | null): string =>
  [title.trim(), description?.trim()].filter(Boolean).join("\n");

export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valueA = a[i] ?? 0;
    const valueB = b[i] ?? 0;
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};
