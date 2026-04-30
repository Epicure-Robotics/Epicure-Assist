import { Sparkles as SparklesIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type GenerateDraftDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (customPrompt?: string) => void;
};

export function GenerateDraftDialog({ open, onOpenChange, onGenerate }: GenerateDraftDialogProps) {
  const [customPrompt, setCustomPrompt] = useState("");

  const handleGenerate = () => {
    onGenerate(customPrompt.trim() || undefined);
    onOpenChange(false);
    setCustomPrompt("");
  };

  const handleSkipAndGenerate = () => {
    onGenerate(undefined);
    onOpenChange(false);
    setCustomPrompt("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="h-5 w-5" />
            Generate Draft Response
          </DialogTitle>
          <DialogDescription>
            Optionally provide instructions to guide the AI in crafting the response. Leave empty to generate with
            default behavior.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="e.g., Keep the tone professional and concise, focus on the refund policy..."
            className="min-h-[120px] border"
            onModEnter={handleGenerate}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outlined" onClick={handleSkipAndGenerate}>
            Generate Without Instructions
          </Button>
          <Button onClick={handleGenerate}>Generate Draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
