import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import type { BasicUserProfile } from "@/db/schema/userProfiles";
import { authUsers } from "@/db/supabaseSchema/auth";
import { getMailbox } from "@/lib/data/mailbox";
import { getBasicProfileByEmail, getBasicProfileById } from "@/lib/data/user";

export type ScriptArgs = Map<string, string | true>;
export type ScriptArgValue = string | true | undefined;

export const CONVERSATION_STATUSES = [
  "open",
  "waiting_on_customer",
  "closed",
  "spam",
  "check_back_later",
  "ignored",
] as const;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const DEFAULT_OPEN_TICKET_STATUSES: ConversationStatus[] = ["open"];

export const parseArgs = (argv: string[] = process.argv.slice(2)): ScriptArgs => {
  const args = new Map<string, string | true>();

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw?.startsWith("--")) continue;

    const normalized = raw.slice(2);
    const [name, valueFromEquals] = normalized.split("=", 2);
    if (!name) continue;

    if (valueFromEquals !== undefined) {
      args.set(name, valueFromEquals);
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(name, next);
      i++;
      continue;
    }

    args.set(name, true);
  }

  return args;
};

export const getArgValue = (args: ScriptArgs, key: string): ScriptArgValue => args.get(key);

export const getArgString = (args: ScriptArgs, key: string): string | undefined => {
  const value = getArgValue(args, key);
  return typeof value === "string" ? value : undefined;
};

export const normalizeEscapedMultilineArg = (value: string | undefined): string | undefined => {
  if (!value) return value;
  if (value.includes("\n") || value.includes("\r")) return value;
  if (!value.includes("\\n") && !value.includes("\\r") && !value.includes("\\t")) return value;

  return value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
};

export const parseIntArg = (args: ScriptArgs, key: string, fallback: number): number => {
  const value = getArgString(args, key);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new Error(`Invalid number for --${key}: ${value}`);
  }
  return parsed;
};

export const parseCSV = (value: string | undefined): string[] =>
  value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];

export const parseOptionalCSV = (value: string | undefined): string[] | undefined => {
  const parsed = parseCSV(value);
  return parsed.length > 0 ? parsed : undefined;
};

export const parseLimit = (args: ScriptArgs, key: string, fallback: number, max = 100): number => {
  const limit = parseIntArg(args, key, fallback);
  if (limit <= 0) throw new Error(`--${key} must be greater than 0`);
  if (limit > max) throw new Error(`--${key} must be at most ${max}`);
  return limit;
};

export const parseConversationStatus = (rawStatus: string | undefined): ConversationStatus | null => {
  if (!rawStatus) return null;
  if (!CONVERSATION_STATUSES.includes(rawStatus as ConversationStatus)) {
    throw new Error(`Invalid status "${rawStatus}". Valid values: ${CONVERSATION_STATUSES.join(", ")}`);
  }
  return rawStatus as ConversationStatus;
};

type ResolveUserOptions = {
  userIdArg?: string;
  userEmailArg?: string;
};

export const resolveUser = async (
  args: ScriptArgs,
  options: ResolveUserOptions = { userIdArg: "user-id", userEmailArg: "user-email" },
): Promise<BasicUserProfile | null> => {
  const userIdArg = options.userIdArg ?? "user-id";
  const userEmailArg = options.userEmailArg ?? "user-email";

  const userId = getArgString(args, userIdArg);
  if (userId) {
    return await getBasicProfileById(userId);
  }

  const userEmail = getArgString(args, userEmailArg);
  if (userEmail) {
    return await getBasicProfileByEmail(userEmail);
  }

  return null;
};

export const resolveRequiredUser = async (
  args: ScriptArgs,
  label: string,
  options?: ResolveUserOptions,
): Promise<BasicUserProfile> => {
  const user = await resolveUser(args, options);
  if (!user) {
    throw new Error(`Missing actor: provide --user-id or --user-email for ${label}`);
  }
  return user;
};

export const requireActiveMailbox = async () => {
  const mailbox = await getMailbox();
  if (!mailbox) {
    throw new Error("No active mailbox found. Ensure one mailbox is configured and not disabled.");
  }
  return mailbox;
};

export const resolveConversationIdArg = (args: ScriptArgs, key: string): number => {
  const value = getArgString(args, key);
  if (!value) throw new Error(`Missing required --${key}`);
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid conversation id for --${key}: ${value}`);
  }
  return id;
};

export const normalizeStatusList = (args: ScriptArgs, key = "status"): ConversationStatus[] => {
  const rawStatuses = parseCSV(getArgString(args, key));
  if (!rawStatuses.length) return [];

  const normalized = rawStatuses
    .map((status) => parseConversationStatus(status))
    .filter((status): status is ConversationStatus => status !== null);

  return normalized;
};

export const assertUserIdsExist = async (userIds: string[]) => {
  if (userIds.length === 0) return;
  const foundUsers = await db.query.authUsers.findMany({
    where: inArray(authUsers.id, userIds),
    columns: { id: true },
  });
  const foundSet = new Set(foundUsers.map((user) => user.id));
  const missing = userIds.filter((id) => !foundSet.has(id));
  if (missing.length) {
    throw new Error(`Unknown user IDs: ${missing.join(", ")}`);
  }
};
