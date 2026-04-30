"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import LoadingSpinner from "@/components/loadingSpinner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/trpc/react";
import SectionWrapper from "../sectionWrapper";

const ImportOldEmail = () => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const { data: { supportAccount } = {} } = api.gmailSupportEmail.get.useQuery();

  const searchThreadsQuery = api.gmailSupportEmail.searchThreads.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 2 },
  );

  const importThreadMutation = api.gmailSupportEmail.importThread.useMutation({
    onSuccess: (data) => {
      toast.success("Email imported successfully!", {
        description: `The email thread has been imported and is now available in your conversations.`,
      });
      setSearchQuery("");
      // Redirect to the imported conversation
      if (data.conversationSlug) {
        router.push(`/conversations?id=${data.conversationSlug}`);
      }
    },
    onError: (error) => {
      toast.error("Failed to import email", {
        description: error.message,
      });
    },
  });

  const handleImport = async (threadId: string) => {
    await importThreadMutation.mutateAsync({ threadId });
  };

  if (!supportAccount) {
    return null;
  }

  return (
    <SectionWrapper
      title="Import Old Emails"
      description="Import old emails from Gmail that are not yet in your database. You can find the thread ID in the Gmail URL or message headers."
    >
      <Alert className="mb-4">
        <div className="text-sm space-y-2">
          <p>
            <strong>How to import an email:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Search by email subject, sender, or keywords</li>
            <li>Select the email thread from the results</li>
            <li>Click &quot;Import&quot; to add it to your conversations</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            <strong>Note:</strong> Only emails in {supportAccount.email} can be imported.
          </p>
        </div>
      </Alert>

      <div className="space-y-4">
        <div>
          <Label htmlFor="search">Search for email</Label>
          <Input
            id="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="e.g., subject:refund, from:customer@example.com"
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use Gmail search syntax: subject:keyword, from:email, after:2024/01/01, etc.
          </p>
        </div>

        {searchThreadsQuery.isLoading && (
          <div className="flex justify-center py-4">
            <LoadingSpinner size="md" />
          </div>
        )}

        {searchThreadsQuery.data?.threads && searchThreadsQuery.data.threads.length > 0 && (
          <div className="space-y-2">
            <Label>Search Results</Label>
            <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
              {searchThreadsQuery.data.threads.map((thread) => (
                <div key={thread.id} className="p-3 hover:bg-accent/50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2">{thread.snippet}</p>
                    </div>
                    <Button size="sm" onClick={() => handleImport(thread.id)} disabled={importThreadMutation.isPending}>
                      {importThreadMutation.isPending ? "Importing..." : "Import"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {searchThreadsQuery.data?.threads && searchThreadsQuery.data.threads.length === 0 && (
          <Alert>No emails found matching your search.</Alert>
        )}
      </div>
    </SectionWrapper>
  );
};

export default ImportOldEmail;
