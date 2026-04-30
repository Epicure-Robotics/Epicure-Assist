import { env } from "@/lib/env";

export const captureExceptionAndThrowIfDevelopment = (error: any, hint?: any) => {
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") throw error;
  else console.error(error, hint);
};

export const captureExceptionAndLog = (error: any, hint?: any) => {
  console.error(error, hint);
};
