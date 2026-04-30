/**
 * Check if current time is within the "weekend" period for auto-reply.
 *
 * The weekend period is defined as:
 * - Start: Friday 5:00 PM EST (Eastern Standard Time)
 * - End: Monday 10:00 AM IST (India Standard Time)
 *
 * This roughly covers:
 * - Friday 5 PM EST = Friday 10 PM UTC = Saturday 3:30 AM IST
 * - Monday 10 AM IST = Monday 4:30 AM UTC = Sunday 11:30 PM EST
 */
export const isWeekendPeriod = (): boolean => {
  const now = new Date();

  // Get current time in EST (America/New_York handles EST/EDT automatically)
  const estFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const estParts = estFormatter.formatToParts(now);
  const estDay = estParts.find((p) => p.type === "weekday")?.value;
  const estHour = parseInt(estParts.find((p) => p.type === "hour")?.value || "0", 10);

  // Get current time in IST (Asia/Kolkata)
  const istFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const istParts = istFormatter.formatToParts(now);
  const istDay = istParts.find((p) => p.type === "weekday")?.value;
  const istHour = parseInt(istParts.find((p) => p.type === "hour")?.value || "0", 10);

  // Weekend period starts Friday 5 PM EST
  const afterFridayStart = estDay === "Fri" && estHour >= 17;

  // Weekend period ends Monday 10 AM IST
  const beforeMondayEnd = istDay === "Mon" && istHour < 10;

  // Full weekend days (Saturday/Sunday in EST)
  const isSaturdayEST = estDay === "Sat";
  const isSundayEST = estDay === "Sun";

  // Within weekend period if:
  // 1. After Friday 5 PM EST, OR
  // 2. It's Saturday or Sunday (in EST), OR
  // 3. It's Monday before 10 AM IST
  return afterFridayStart || isSaturdayEST || isSundayEST || beforeMondayEnd;
};
