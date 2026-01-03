import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "bg-card text-card-foreground rounded-xl border shadow-sm transition-all duration-200 relative",
  {
    variants: {
      accent: {
        none: "border-border",
        blue: "[--accent:theme(colors.blue.500)] [--accent-bg:theme(colors.blue.500/0.05)] [--accent-bg-hover:theme(colors.blue.500/0.1)] [--accent-border:theme(colors.blue.500/0.3)] border-transparent",
        emerald:
          "[--accent:theme(colors.emerald.500)] [--accent-bg:theme(colors.emerald.500/0.05)] [--accent-bg-hover:theme(colors.emerald.500/0.1)] [--accent-border:theme(colors.emerald.500/0.3)] border-transparent",
        violet:
          "[--accent:theme(colors.violet.500)] [--accent-bg:theme(colors.violet.500/0.05)] [--accent-bg-hover:theme(colors.violet.500/0.1)] [--accent-border:theme(colors.violet.500/0.3)] border-transparent",
        orange:
          "[--accent:theme(colors.orange.500)] [--accent-bg:theme(colors.orange.500/0.05)] [--accent-bg-hover:theme(colors.orange.500/0.1)] [--accent-border:theme(colors.orange.500/0.3)] border-transparent",
        purple:
          "[--accent:theme(colors.purple.500)] [--accent-bg:theme(colors.purple.500/0.05)] [--accent-bg-hover:theme(colors.purple.500/0.1)] [--accent-border:theme(colors.purple.500/0.3)] border-transparent",
        amber:
          "[--accent:theme(colors.amber.500)] [--accent-bg:theme(colors.amber.500/0.05)] [--accent-bg-hover:theme(colors.amber.500/0.1)] [--accent-border:theme(colors.amber.500/0.3)] border-transparent",
      },
      interactive: {
        true: "cursor-pointer group",
        false: "",
      },
    },
    compoundVariants: [
      {
        accent: "none",
        interactive: true,
        className: "border-foreground/10 hover:border-foreground/20 hover:shadow-md",
      },
      {
        accent: ["blue", "emerald", "violet", "orange", "purple", "amber"],
        className: "border-[var(--accent-border)]/50",
      },
      {
        accent: ["blue", "emerald", "violet", "orange", "purple", "amber"],
        interactive: true,
        className: "hover:border-[var(--accent-border)] hover:shadow-md",
      },
    ],
    defaultVariants: {
      accent: "none",
      interactive: false,
    },
  },
);

interface CardProps extends React.ComponentProps<"div">, VariantProps<typeof cardVariants> {}

function Card({ className, accent, interactive, children, ...props }: CardProps) {
  const hasAccent = accent && accent !== "none";

  return (
    <div data-slot="card" className={cn(cardVariants({ accent, interactive }), className)} {...props}>
      {hasAccent && (
        <div
          className={cn(
            "absolute inset-0 rounded-xl bg-[var(--accent-bg)] transition-colors pointer-events-none",
            interactive && "group-hover:bg-[var(--accent-bg-hover)]",
          )}
        />
      )}
      {children}
    </div>
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("p-6 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center p-6 pt-0", className)} {...props} />;
}

function CardIcon({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-icon"
      className={cn(
        "flex size-12 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] shrink-0",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function CardIconSmall({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-icon-small"
      className={cn(
        "flex size-9 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] shrink-0",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  CardIcon,
  CardIconSmall,
  cardVariants,
};
