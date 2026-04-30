import { z } from "zod";

const helperMcpEnvSchema = z
  .object({
    HELPER_MCP_USER_ID: z.string().uuid().optional(),
    HELPER_MCP_USER_EMAIL: z.string().email().optional(),
    HELPER_MCP_BEARER_TOKEN: z.string().min(1).optional(),
    HELPER_MCP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    HELPER_MCP_HOST: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.HELPER_MCP_USER_ID && value.HELPER_MCP_USER_EMAIL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Set only one of HELPER_MCP_USER_ID or HELPER_MCP_USER_EMAIL.",
        path: ["HELPER_MCP_USER_ID"],
      });
    }
  });

export const helperMcpEnv = helperMcpEnvSchema.parse(process.env);
