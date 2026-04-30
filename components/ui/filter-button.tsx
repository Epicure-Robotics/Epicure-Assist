import { LucideIcon } from "lucide-react";
import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FilterButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
  icon?: LucideIcon;
  label: React.ReactNode;
  count?: number;
}

export const FilterButton = forwardRef<HTMLButtonElement, FilterButtonProps>(
  ({ isActive, icon: Icon, label, count, className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant={isActive ? "bright" : "ghost"}
        size="sm"
        className={cn(
          "h-7 rounded-md px-2.5 text-xs font-medium border transition-all",
          isActive
            ? "border-transparent ring-0"
            : "border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-border/80 bg-background/50",
          className,
        )}
        {...props}
      >
        {Icon && <Icon className={cn("mr-1.5 h-3.5 w-3.5", isActive ? "text-inherit" : "text-muted-foreground/70")} />}
        <span className="truncate max-w-[150px]">{label}</span>
        {count !== undefined && (
          <span
            className={cn(
              "ml-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px]",
              isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
            )}
          >
            {count}
          </span>
        )}
      </Button>
    );
  },
);

FilterButton.displayName = "FilterButton";
