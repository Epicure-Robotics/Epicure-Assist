"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSavingIndicator } from "@/components/hooks/useSavingIndicator";
import { SavingIndicator } from "@/components/savingIndicator";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useOnChange } from "@/components/useOnChange";
import { RouterOutputs } from "@/trpc";
import { api } from "@/trpc/react";
import SectionWrapper from "../sectionWrapper";

export default function ClosedThreadEmailSetting({ mailbox }: { mailbox: RouterOutputs["mailbox"]["get"] }) {
  const [isEnabled, setIsEnabled] = useState(mailbox.closedThreadEmailEnabled);
  const savingIndicator = useSavingIndicator();
  const utils = api.useUtils();

  const { mutate: update } = api.mailbox.update.useMutation({
    onSuccess: () => {
      utils.mailbox.get.invalidate();
      savingIndicator.setState("saved");
    },
    onError: (error) => {
      savingIndicator.setState("error");
      toast.error("Error updating closed thread email settings", {
        description: error.message,
      });
    },
  });

  useOnChange(() => {
    savingIndicator.setState("saving");
    update({
      closedThreadEmailEnabled: isEnabled,
    });
  }, [isEnabled]);

  return (
    <div className="relative">
      <div className="absolute top-2 right-4 z-10">
        <SavingIndicator state={savingIndicator.state} />
      </div>
      <SectionWrapper
        title="Closed Thread Notification"
        description="Send an email notification to customers 24 hours after their ticket is closed by staff."
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="closed-thread-email-toggle">Enable closure notification</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, customers will receive an email 24 hours after their ticket is closed, letting them know
                they can reply if they need further assistance.
              </p>
            </div>
            <Switch id="closed-thread-email-toggle" checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>
        </div>
      </SectionWrapper>
    </div>
  );
}
