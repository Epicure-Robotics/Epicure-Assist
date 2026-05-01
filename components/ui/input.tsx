import * as React from "react";
import { onModEnterKeyboardEvent } from "@/components/onModEnterKeyboardEvent";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onModEnter?: () => void;
  hint?: React.ReactNode;
  iconsSuffix?: React.ReactNode;
  iconsPrefix?: React.ReactNode;
  ref?: React.Ref<HTMLInputElement>;
}

const Input = ({ className, type, onModEnter, iconsSuffix, iconsPrefix, hint, ref, ...props }: InputProps) => {
  return (
    <>
      <div className="relative grow">
        {iconsPrefix && <div className="absolute inset-y-0 left-0 flex items-center gap-2 pl-3">{iconsPrefix}</div>}
        <input
          type={type}
          className={cn(
            "h-10 w-full rounded-md border border-border/80 bg-background px-3 py-2 text-sm transition-shadow placeholder:text-muted-foreground focus:border-border focus:outline-hidden focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50",
            iconsPrefix && "pl-10",
            className,
          )}
          ref={ref}
          onKeyDown={props.onKeyDown || (onModEnter ? onModEnterKeyboardEvent(onModEnter) : undefined)}
          {...props}
        />
        {iconsSuffix && <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-3">{iconsSuffix}</div>}
      </div>
      {hint && <div className="mt-2 text-sm text-muted-foreground">{hint}</div>}
    </>
  );
};
Input.displayName = "Input";

export { Input };
