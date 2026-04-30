import { useSession } from "@/components/useSession";
import { getFirstName } from "@/lib/auth/authUtils";

export const EmailSignature = () => {
  const { user } = useSession() ?? {};

  // Don't show signature if user has disabled it or if displayName is not available
  if (!user?.displayName || user?.preferences?.disableEmailSignature) {
    return null;
  }

  return (
    <div className="mt-8 text-muted-foreground opacity-50 text-[10px]">
      Best,
      <br />
      {getFirstName(user)}
      <br />
      <br />
      <a
        href="https://docs.google.com/forms/d/e/1FAIpQLSd0l60SUS24VPsHmeVsLsBPtcwCXaLY-jjYwSgtZV3dgENB6w/viewform?usp=header"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:opacity-100 transition-opacity"
      >
        Rate our support: 😀 · 😐 · 🙁
      </a>
    </div>
  );
};
