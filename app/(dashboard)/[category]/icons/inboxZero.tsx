"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Empty inbox illustration: Epicure “ER” mark (replaces legacy hand animation). */
export const InboxZero = ({ className }: { className?: string }) => {
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
        width={240}
        height={240}
        className="size-full max-h-60 max-w-60 rounded-2xl object-contain shadow-md shadow-foreground/10"
        unoptimized
        priority
      />
    </div>
  );
};
