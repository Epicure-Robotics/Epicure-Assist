import { getPocketUserByEmail, isPocketConfigured } from "@/lib/pocket/client";
import { PocketApiError } from "@/lib/pocket/types";
import { getArgString, parseArgs } from "./_helpers";

const usage = `
Usage:
  pnpm with-dev-env node --conditions=react-server --import=tsx/esm pocket-helper-skills/scripts/get-pocket-user-info.ts \\
    --email <user-email>
`;

const run = async () => {
  const args = parseArgs();
  if (args.has("help") || args.has("h")) {
    console.log(usage.trim());
    return;
  }

  const email = getArgString(args, "email");
  if (!email) {
    throw new Error("Missing --email");
  }

  if (!isPocketConfigured()) {
    console.log(
      JSON.stringify(
        {
          configured: false,
          email,
          user: null,
          found: false,
          error: null,
        },
        null,
        2,
      ),
    );
    return;
  }

  try {
    const { user, found } = await getPocketUserByEmail(email);

    console.log(
      JSON.stringify(
        {
          configured: true,
          email,
          user,
          found,
          error: null,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    let errorMessage = "Failed to fetch Pocket user information";

    if (error instanceof PocketApiError) {
      if (error.code === "CONNECTION_ERROR") {
        errorMessage = "Could not connect to Pocket database";
      } else if (error.code === "TIMEOUT") {
        errorMessage = "Pocket database query timed out";
      } else if (error.code === "TABLE_NOT_FOUND") {
        errorMessage = "Users table not found in Pocket database";
      } else {
        errorMessage = error.message;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    console.log(
      JSON.stringify(
        {
          configured: true,
          email,
          user: null,
          found: false,
          error: errorMessage,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
};

try {
  await run();
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Failed to run get-pocket-user-info script");
  }
  process.exit(1);
}
