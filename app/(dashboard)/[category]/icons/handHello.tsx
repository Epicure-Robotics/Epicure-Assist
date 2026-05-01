"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Welcome / onboarding illustration: same ER mark as empty inbox (replaces legacy hand animation). */
export const HandHello = ({ className }: { className?: string }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      className={cn(
        "flex items-center justify-center transition-[opacity,transform] duration-500 ease-out",
        visible ? "scale-100 opacity-100" : "scale-[0.96] opacity-0",
        className,
      )}
    >
      <Image
        src="/logo.svg"
        alt=""
        width={144}
        height={144}
        className="size-36 max-h-36 max-w-36 rounded-xl object-contain shadow-md shadow-foreground/10"
        unoptimized
        priority
      />
    </div>
  );
};
