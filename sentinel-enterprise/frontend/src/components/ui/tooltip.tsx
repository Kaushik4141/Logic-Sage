import * as React from "react";

import { cn } from "@/lib/utils";

type TooltipContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

function useTooltipContext() {
  const context = React.useContext(TooltipContext);

  if (!context) {
    throw new Error("Tooltip components must be used within <Tooltip>.");
  }

  return context;
}

function TooltipProvider({ children }: { children: React.ReactNode; delayDuration?: number }) {
  return <>{children}</>;
}

function Tooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <span
        className="relative inline-flex"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
    </TooltipContext.Provider>
  );
}

type TooltipTriggerProps = React.HTMLAttributes<HTMLElement> & {
  asChild?: boolean;
  children?: React.ReactNode;
  [key: string]: unknown;
};

function TooltipTrigger({ asChild, children, ...props }: TooltipTriggerProps) {
  const { setOpen } = useTooltipContext();

  if (asChild && React.isValidElement(children)) {
    const childProps = (children.props ?? {}) as Record<string, unknown>;

    return React.cloneElement(children as React.ReactElement<any>, {
      ...childProps,
      ...props,
      onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
        setOpen(true);
        props.onMouseEnter?.(event);
        (childProps.onMouseEnter as ((event: React.MouseEvent<HTMLElement>) => void) | undefined)?.(event);
      },
      onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
        setOpen(false);
        props.onMouseLeave?.(event);
        (childProps.onMouseLeave as ((event: React.MouseEvent<HTMLElement>) => void) | undefined)?.(event);
      },
      onFocus: (event: React.FocusEvent<HTMLElement>) => {
        setOpen(true);
        props.onFocus?.(event);
        (childProps.onFocus as ((event: React.FocusEvent<HTMLElement>) => void) | undefined)?.(event);
      },
      onBlur: (event: React.FocusEvent<HTMLElement>) => {
        setOpen(false);
        props.onBlur?.(event);
        (childProps.onBlur as ((event: React.FocusEvent<HTMLElement>) => void) | undefined)?.(event);
      },
    });
  }

  return (
    <span
      {...props}
      onMouseEnter={(event) => {
        setOpen(true);
        props.onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setOpen(false);
        props.onMouseLeave?.(event);
      }}
      onFocus={(event) => {
        setOpen(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setOpen(false);
        props.onBlur?.(event);
      }}
    >
      {children}
    </span>
  );
}

type TooltipContentProps = React.HTMLAttributes<HTMLSpanElement> & {
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
  [key: string]: unknown;
};

function TooltipContent({
  className,
  children,
  side = "top",
  sideOffset = 8,
  align,
  ...props
}: TooltipContentProps) {
  const { open } = useTooltipContext();
  void align;

  const sideClasses =
    side === "bottom"
      ? "left-1/2 top-full -translate-x-1/2"
      : side === "left"
        ? "right-full top-1/2 -translate-y-1/2"
        : side === "right"
          ? "left-full top-1/2 -translate-y-1/2"
          : "bottom-full left-1/2 -translate-x-1/2";

  const spacingStyle =
    side === "bottom"
      ? { marginTop: sideOffset }
      : side === "left"
        ? { marginRight: sideOffset }
        : side === "right"
          ? { marginLeft: sideOffset }
          : { marginBottom: sideOffset };

  return (
    <span
      {...props}
      style={spacingStyle}
      className={cn(
        "pointer-events-none absolute z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md transition-opacity",
        sideClasses,
        open ? "opacity-100" : "opacity-0",
        className
      )}
    >
      {children}
    </span>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
