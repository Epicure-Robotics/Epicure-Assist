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
      className={
        isHoliday
          ? "flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-amber-200/70 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-950"
          : "flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-primary/12 bg-primary/[0.07] px-4 py-2.5 text-center text-sm text-foreground"
      }
    >
      <span>
        <strong>{isHoliday ? "Holiday" : "Weekend"} auto-reply is active.</strong> Incoming emails will receive an
        automatic response.
      </span>
      <Link
        href="/settings/customers"
        className="font-semibold underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
      >
        {isHoliday ? "Disable" : "Settings"}
      </Link>
    </div>
  );
}
