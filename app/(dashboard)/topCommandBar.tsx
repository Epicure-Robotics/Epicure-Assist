"use client";

import { ArrowRight, Search, Send } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

function isListRoute(pathname: string) {
  // list routes are top-level categories: /mine, /assigned, /all, etc.
  return /^\/(mine|assigned|all|closed|open|spam|check_back_later|ignored)(\/|$)/.test(pathname);
}

export function TopCommandBar({ mailboxName }: { mailboxName?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isSettings = pathname.startsWith("/settings");
  const showSearch = !isSettings && isListRoute(pathname);

  const inputRef = useRef<HTMLInputElement>(null);
  const initialSearch = useMemo(() => searchParams.get("search") ?? "", [searchParams]);
  const [search, setSearch] = useState(initialSearch);

  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    if (!showSearch) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      if (search.trim()) next.set("search", search.trim());
      else next.delete("search");
      router.replace(`${pathname}?${next.toString()}`);
    }, 250);
    return () => clearTimeout(t);
  }, [search, pathname, router, searchParams, showSearch]);

  return (
    <div className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/55">
      <div className="h-12 px-3 md:px-6 flex items-center gap-3">
        <div className="flex items-center gap-0.5 min-w-0 md:gap-1">
          <SidebarTrigger
            className={cn(
              "shrink-0 h-8 w-8 rounded-lg text-muted-foreground",
              "hover:bg-muted/60 hover:text-foreground",
            )}
          />
          <Link
            href="/all"
            className={cn(
              "inline-flex min-w-0 items-center gap-2 rounded-lg px-2 py-1",
              "hover:bg-muted/60 transition-colors",
            )}
            aria-label="Epicure Assist"
          >
            <Image src="/logo.svg" alt="ER" width={20} height={20} className="shrink-0 rounded" unoptimized />
            <span className="hidden md:block text-sm font-semibold tracking-tight truncate">
              {mailboxName || "Epicure Assist"}
            </span>
            <ArrowRight className="hidden md:block h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center">
          {showSearch ? (
            <div className="w-full max-w-[720px]">
              <Input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tickets, senders, subjects…"
                className="h-9 rounded-xl bg-muted/35 border-border/70"
                iconsPrefix={<Search className="ml-1 h-4 w-4 text-muted-foreground" />}
              />
            </div>
          ) : (
            <div className="w-full max-w-[720px]" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="bright"
            size="sm"
            iconOnly
            className="rounded-full shadow-sm"
            aria-label="New message"
            onClick={() => router.push(`${pathname}?new=1`)}
          >
            <Send className="h-4 w-4 -rotate-90" />
          </Button>
        </div>
      </div>
    </div>
  );
}
