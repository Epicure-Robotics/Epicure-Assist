import { LoginForm } from "@/app/login/loginForm";
import { OnboardingForm } from "@/app/login/onboardingForm";
import { db } from "@/db/client";
import { TRPCReactProvider } from "@/trpc/react";

export const dynamic = "force-dynamic";

export default async function Page() {
  const mailbox = await db.query.mailboxes.findFirst({
    columns: { id: true },
  });

  return (
    <TRPCReactProvider>
      <div className="relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-[var(--color-brand-canvas)] p-6 md:p-12">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 100% 70% at 50% -25%, hsl(168 45% 30% / 0.14), transparent 52%), radial-gradient(ellipse 70% 55% at 100% 110%, hsl(36 88% 52% / 0.1), transparent 48%)",
          }}
        />
        <div className="relative w-full max-w-md rounded-2xl border border-border/70 bg-card/95 p-8 shadow-xl shadow-foreground/[0.06] backdrop-blur-md md:p-10">
          <div className="mx-auto w-full max-w-sm">{mailbox ? <LoginForm /> : <OnboardingForm />}</div>
        </div>
      </div>
    </TRPCReactProvider>
  );
}
