"use client";

import Link from "next/link";
import { isWeekendPeriod } from "@/lib/utils/weekendPeriod";
import { api } from "@/trpc/react";

export default function AutoReplyBanner() {
  const { data: mailbox } = api.mailbox.get.useQuery();

  if (!mailbox) return null;

  const isHolidayActive = mailbox.holidayAutoReplyEnabled && mailbox.holidayAutoReplyMessage;
  const isWeekendActive = mailbox.weekendAutoReplyEnabled && mailbox.weekendAutoReplyMessage && isWeekendPeriod();

  // Determine which mode is active (holiday takes priority)
  let mode: "holiday" | "weekend" | null = null;
  if (isHolidayActive) {
    mode = "holiday";
  } else if (isWeekendActive) {
    mode = "weekend";
  }

  if (!mode) return null;

  const isHoliday = mode === "holiday";

  return (
    <div
      className={`flex items-center justify-center gap-2 px-4 py-2 text-sm ${
        isHoliday
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
          : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
      }`}
    >
      <span>{isHoliday ? "🏖️" : "📅"}</span>
      <span>
        <strong>{isHoliday ? "Holiday" : "Weekend"} auto-reply is active.</strong> Incoming emails will receive an
        automatic response.
      </span>
      <Link href="/settings/customers" className="underline hover:no-underline font-medium">
        {isHoliday ? "Disable" : "Settings"}
      </Link>
    </div>
  );
}
