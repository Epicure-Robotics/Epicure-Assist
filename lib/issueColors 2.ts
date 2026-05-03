export const ISSUE_COLORS = [
  "#3B82F6", // Blue
  "#EF4444", // Red
  "#10B981", // Green
  "#F59E0B", // Amber
  "#6366F1", // Indigo
  "#8B5CF6", // Violet
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#84CC16", // Lime
  "#F97316", // Orange
];

export const getRandomIssueColor = () => {
  return ISSUE_COLORS[Math.floor(Math.random() * ISSUE_COLORS.length)];
};
