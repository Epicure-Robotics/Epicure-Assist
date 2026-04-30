"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSavingIndicator } from "@/components/hooks/useSavingIndicator";
import { SavingIndicator } from "@/components/savingIndicator";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedCallback } from "@/components/useDebouncedCallback";
import { useOnChange } from "@/components/useOnChange";
import { RouterOutputs } from "@/trpc";
import { api } from "@/trpc/react";
import SectionWrapper from "../sectionWrapper";

export default function HolidayAutoReplySetting({ mailbox }: { mailbox: RouterOutputs["mailbox"]["get"] }) {
  const [isEnabled, setIsEnabled] = useState(mailbox.holidayAutoReplyEnabled);
  const [message, setMessage] = useState(
    mailbox.holidayAutoReplyMessage ??
      "Thank you for reaching out! Our support team is currently on holiday. We'll get back to you as soon as we return.\n\nIn the meantime, you can get immediate assistance from our help center.",
  );
  const savingIndicator = useSavingIndicator();
  const utils = api.useUtils();

  const { mutate: update } = api.mailbox.update.useMutation({
    onSuccess: () => {
      utils.mailbox.get.invalidate();
      savingIndicator.setState("saved");
    },
    onError: (error) => {
      savingIndicator.setState("error");
      toast.error("Error updating holiday auto-reply settings", {
        description: error.message,
      });
    },
  });

  const save = useDebouncedCallback(() => {
    savingIndicator.setState("saving");
    update({
      holidayAutoReplyEnabled: isEnabled,
      holidayAutoReplyMessage: message || null,
    });
  }, 500);

  useOnChange(() => {
    save();
  }, [isEnabled, message]);

  return (
    <div className="relative">
      <div className="absolute top-2 right-4 z-10">
        <SavingIndicator state={savingIndicator.state} />
      </div>
      <SectionWrapper
        title="Holiday Auto-Reply (Manual)"
        description="Manually enable an out-of-office auto-reply for extended holidays like Christmas, New Year's, or vacations. Takes priority over weekend auto-reply when enabled."
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="holiday-auto-reply-toggle">Enable holiday auto-reply</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, all incoming emails will receive an automatic response until you disable it.
              </p>
            </div>
            <Switch id="holiday-auto-reply-toggle" checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          {isEnabled && (
            <>
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-3">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  ⚠️ Holiday mode is currently <strong>active</strong>. All incoming emails will receive the auto-reply
                  message below. Remember to disable this when you return!
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="holiday-auto-reply-message">Auto-reply message</Label>
                <Textarea
                  id="holiday-auto-reply-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="Enter the message to send during your holiday..."
                  className="resize-none"
                />
              </div>
            </>
          )}
        </div>
      </SectionWrapper>
    </div>
  );
}
