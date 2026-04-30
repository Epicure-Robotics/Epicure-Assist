import { eq, getTableColumns, isNull } from "drizzle-orm";
import { cache } from "react";
import { takeUniqueOrThrow } from "@/components/utils/arrays";
import { db } from "@/db/client";
import { FullUserProfile, userProfiles } from "@/db/schema/userProfiles";
import { authUsers } from "@/db/supabaseSchema/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getFirstName, getFullName } from "../auth/authUtils";
import { getSlackUser } from "../slack/client";

export const UserRoles = {
  CORE: "core",
  NON_CORE: "nonCore",
  AFK: "afk",
} as const;

export type UserRole = (typeof UserRoles)[keyof typeof UserRoles];

type MailboxAccess = {
  role: UserRole;
  keywords: string[];
  updatedAt: string;
};

export type UserWithMailboxAccessData = {
  id: string;
  displayName: string;
  email: string | undefined;
  role: UserRole;
  keywords: MailboxAccess["keywords"];
  permissions: string;
  emailOnAssignment: boolean;
};

export const getProfile = cache(
  async (userId: string) => await db.query.userProfiles.findFirst({ where: eq(userProfiles.id, userId) }),
);

export const getBasicProfileById = cache(async (userId: string) => {
  const [user] = await db
    .select({ id: userProfiles.id, displayName: userProfiles.displayName, email: authUsers.email })
    .from(userProfiles)
    .innerJoin(authUsers, eq(userProfiles.id, authUsers.id))
    .where(eq(userProfiles.id, userId));
  return user ?? null;
});

export const getBasicProfileByEmail = cache(async (email: string) => {
  const [user] = await db
    .select({ id: userProfiles.id, displayName: userProfiles.displayName, email: authUsers.email })
    .from(userProfiles)
    .innerJoin(authUsers, eq(userProfiles.id, authUsers.id))
    .where(eq(authUsers.email, email));
  return user ?? null;
});

export const getFullProfileById = cache(async (userId: string): Promise<FullUserProfile | null> => {
  const [user] = await db
    .select({ ...getTableColumns(userProfiles), email: authUsers.email })
    .from(userProfiles)
    .innerJoin(authUsers, eq(userProfiles.id, authUsers.id))
    .where(eq(userProfiles.id, userId));
  return user ?? null;
});

export const getFullProfileByEmail = cache(async (email: string): Promise<FullUserProfile | null> => {
  const [user] = await db
    .select({ ...getTableColumns(userProfiles), email: authUsers.email })
    .from(userProfiles)
    .innerJoin(authUsers, eq(userProfiles.id, authUsers.id))
    .where(eq(authUsers.email, email));
  return user ?? null;
});

export const isAdmin = (profile?: typeof userProfiles.$inferSelect) => profile?.permissions === "admin";

export const addUser = async (
  inviterUserId: string,
  emailAddress: string,
  displayName: string,
  permission?: string,
) => {
  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.createUser({
    email: emailAddress,
    user_metadata: {
      inviter_user_id: inviterUserId,
      display_name: displayName,
      permissions: permission ?? "member",
    },
  });
  if (error) throw error;
};

export const banUser = async (userId: string) => {
  await db
    .update(userProfiles)
    .set({
      deletedAt: new Date(),
    })
    .where(eq(userProfiles.id, userId));
};

export const getUsersWithMailboxAccess = async (): Promise<UserWithMailboxAccessData[]> => {
  const users = await db
    .select({
      id: userProfiles.id,
      email: authUsers.email,
      displayName: userProfiles.displayName,
      permissions: userProfiles.permissions,
      access: userProfiles.access,
      preferences: userProfiles.preferences,
    })
    .from(authUsers)
    .innerJoin(userProfiles, eq(authUsers.id, userProfiles.id))
    .where(isNull(userProfiles.deletedAt));

  return users.map((user) => {
    const access = user.access ?? { role: "afk", keywords: [] };
    const permissions = user.permissions ?? "member";

    return {
      id: user.id,
      displayName: user.displayName ?? "",
      email: user.email ?? undefined,
      role: access.role,
      keywords: access?.keywords ?? [],
      permissions,
      emailOnAssignment: user.preferences?.notifications?.emailOnAssignment ?? false,
    };
  });
};

export const updateUserMailboxData = async (
  userId: string,
  updates: {
    displayName?: string;
    role?: UserRole;
    keywords?: MailboxAccess["keywords"];
    permissions?: string;
    emailOnAssignment?: boolean;
  },
): Promise<UserWithMailboxAccessData> => {
  // Fetch current user data to preserve existing values
  const currentUser = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.id, userId),
    columns: {
      access: true,
      preferences: true,
    },
  });

  const currentAccess = currentUser?.access ?? { role: "afk", keywords: [] };
  const currentPreferences = currentUser?.preferences ?? {};

  // Prepare update object with conditional fields
  const updateData: any = {};

  if (updates.displayName !== undefined) {
    updateData.displayName = updates.displayName;
  }

  if (updates.role !== undefined || updates.keywords !== undefined) {
    updateData.access = {
      role: updates.role ?? currentAccess.role,
      keywords: updates.keywords ?? currentAccess.keywords,
    };
  }

  if (updates.permissions !== undefined) {
    updateData.permissions = updates.permissions;
  }

  if (updates.emailOnAssignment !== undefined) {
    const currentNotifications = currentPreferences.notifications ?? {};
    updateData.preferences = {
      ...currentPreferences,
      notifications: {
        ...currentNotifications,
        emailOnAssignment: updates.emailOnAssignment,
      },
    };
  }

  await db.update(userProfiles).set(updateData).where(eq(userProfiles.id, userId));

  const updatedProfile = await db
    .select({
      id: userProfiles.id,
      displayName: userProfiles.displayName,
      access: userProfiles.access,
      permissions: userProfiles.permissions,
      preferences: userProfiles.preferences,
      createdAt: userProfiles.createdAt,
      updatedAt: userProfiles.updatedAt,
      email: authUsers.email,
    })
    .from(userProfiles)
    .innerJoin(authUsers, eq(userProfiles.id, authUsers.id))
    .where(eq(userProfiles.id, userId))
    .then(takeUniqueOrThrow);

  return {
    id: updatedProfile?.id ?? userId,
    displayName: getFullName(updatedProfile),
    email: updatedProfile?.email ?? undefined,
    role: updatedProfile?.access?.role || "afk",
    keywords: updatedProfile?.access?.keywords || [],
    permissions: updatedProfile?.permissions ?? "",
    emailOnAssignment: updatedProfile?.preferences?.notifications?.emailOnAssignment ?? false,
  };
};

export const findUserViaSlack = cache(async (token: string, slackUserId: string): Promise<FullUserProfile | null> => {
  const slackUser = await getSlackUser(token, slackUserId);
  const user = await getFullProfileByEmail(slackUser?.profile?.email ?? "");
  return user ?? null;
});

export const getStaffName = async (userId: string | null) => {
  if (!userId) return null;
  const user = await getBasicProfileById(userId);
  return user ? getFirstName(user) : null;
};
