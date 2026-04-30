"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSavingIndicator } from "@/components/hooks/useSavingIndicator";
import { SavingIndicator } from "@/components/savingIndicator";
import { Switch } from "@/components/ui/switch";
import { useDebouncedCallback } from "@/components/useDebouncedCallback";
import { useOnChange } from "@/components/useOnChange";
import { RouterOutputs } from "@/trpc";
import { api } from "@/trpc/react";
import SectionWrapper from "../sectionWrapper";

const GmailArchiveSetting = ({ mailbox }: { mailbox: RouterOutputs["mailbox"]["get"] }) => {
  const [enabled, setEnabled] = useState(mailbox.preferences?.archiveGmailOnReply ?? false);
  const savingIndicator = useSavingIndicator();
  const utils = api.useUtils();

  const { mutate: update } = api.mailbox.update.useMutation({
    onSuccess: () => {
      utils.mailbox.get.invalidate();
      savingIndicator.setState("saved");
    },
    onError: (error) => {
      savingIndicator.setState("error");
      toast.error("Error updating Gmail archive settings", { description: error.message });
    },
  });

  const save = useDebouncedCallback(() => {
    savingIndicator.setState("saving");
    update({
      preferences: {
        archiveGmailOnReply: enabled,
      },
    });
  }, 500);

  useOnChange(() => {
    save();
  }, [enabled]);

  return (
    <div className="relative">
      <div className="absolute top-2 right-4 z-10">
        <SavingIndicator state={savingIndicator.state} />
      </div>
      <SectionWrapper
        title="Auto-archive Gmail on reply"
        description="Automatically archive emails from your Gmail inbox when you send a reply. The email will remain accessible in All Mail and through search."
      >
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <span className="text-sm text-muted-foreground">{enabled ? "Enabled" : "Disabled"}</span>
        </div>
      </SectionWrapper>
    </div>
  );
};

export default GmailArchiveSetting;
