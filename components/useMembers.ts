import { api } from "@/trpc/react";

export const useMembers = () => {
  const result = api.mailbox.members.list.useQuery(undefined, {
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  return {
    ...result,
    data: result.data?.members,
  };
};
