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

export default function WeekendAutoReplySetting({ mailbox }: { mailbox: RouterOutputs["mailbox"]["get"] }) {
  const [isEnabled, setIsEnabled] = useState(mailbox.weekendAutoReplyEnabled);
  const [message, setMessage] = useState(
    mailbox.weekendAutoReplyMessage ??
      "Thank you for reaching out! Our support team is currently away for the weekend. We'll get back to you on the next business day.\n\nIn the meantime, you can get immediate assistance from our chatbot.",
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
      toast.error("Error updating weekend auto-reply settings", {
        description: error.message,
      });
    },
  });

  const save = useDebouncedCallback(() => {
    savingIndicator.setState("saving");
    update({
      weekendAutoReplyEnabled: isEnabled,
      weekendAutoReplyMessage: message || null,
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
        title="Weekend Auto-Reply"
        description="Automatically reply to customers who email during off-hours (Friday 5 PM EST to Monday 10 AM IST)."
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="weekend-auto-reply-toggle">Enable weekend auto-reply</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, customers who email on weekends will receive an automatic response.
              </p>
            </div>
            <Switch id="weekend-auto-reply-toggle" checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          {isEnabled && (
            <div className="space-y-2">
              <Label htmlFor="weekend-auto-reply-message">Auto-reply message</Label>
              <Textarea
                id="weekend-auto-reply-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="Enter the message to send to customers on weekends..."
                className="resize-none"
              />
              <p className="text-sm text-muted-foreground">
                This message will be sent automatically from Friday 5 PM EST to Monday 10 AM IST.
              </p>
            </div>
          )}
        </div>
      </SectionWrapper>
    </div>
  );
}
