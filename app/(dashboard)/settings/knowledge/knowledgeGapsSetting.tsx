"use client";

import { PlusCircle, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { stripHtmlTags } from "@/components/utils/html";
import { api } from "@/trpc/react";
import SectionWrapper from "../sectionWrapper";

const KnowledgeGapsSetting = () => {
  const utils = api.useUtils();
  const { data: gaps = [], isLoading } = api.mailbox.knowledgeGaps.list.useQuery({ limit: 20 });

  const resolveMutation = api.mailbox.knowledgeGaps.resolve.useMutation({
    onSuccess: () => {
      utils.mailbox.knowledgeGaps.list.invalidate();
    },
    onError: () => {
      toast.error("Failed to dismiss gap");
    },
  });

  const createFaqMutation = api.mailbox.faqs.create.useMutation({
    onSuccess: () => {
      toast.success("Added to knowledge bank!");
      utils.mailbox.faqs.list.invalidate();
    },
    onError: (error) => {
      toast.error("Error adding to knowledge bank", { description: error.message });
    },
  });

  const handleAddToKnowledgeBank = async (gap: { id: number; query: string }) => {
    await createFaqMutation.mutateAsync({ content: stripHtmlTags(gap.query) });
    resolveMutation.mutate({ id: gap.id });
  };

  if (!isLoading && gaps.length === 0) return null;

  return (
    <SectionWrapper
      title="Knowledge Gaps"
      description="Questions customers asked where no relevant knowledge was found. Add them to your knowledge bank to improve future responses."
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-secondary animate-skeleton" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {gaps.map((gap) => (
            <GapRow
              key={gap.id}
              gap={gap}
              onAdd={() => handleAddToKnowledgeBank(gap)}
              onDismiss={() => resolveMutation.mutate({ id: gap.id })}
              isAdding={createFaqMutation.isPending}
              isDismissing={resolveMutation.isPending}
            />
          ))}
        </div>
      )}
    </SectionWrapper>
  );
};

const GapRow = ({
  gap,
  onAdd,
  onDismiss,
  isAdding,
  isDismissing,
}: {
  gap: { id: number; query: string; count: number; lastSeenAt: Date };
  onAdd: () => void;
  onDismiss: () => void;
  isAdding: boolean;
  isDismissing: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const displayQuery = stripHtmlTags(gap.query);

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm cursor-pointer ${!expanded ? "line-clamp-2" : ""}`}
          onClick={() => setExpanded((v) => !v)}
        >
          {displayQuery}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="gray" className="text-xs">
            {gap.count} {gap.count === 1 ? "time" : "times"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Last seen {new Date(gap.lastSeenAt).toLocaleDateString()}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="subtle" size="sm" onClick={onAdd} disabled={isAdding || isDismissing}>
          <PlusCircle className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss} disabled={isDismissing || isAdding}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

export default KnowledgeGapsSetting;
