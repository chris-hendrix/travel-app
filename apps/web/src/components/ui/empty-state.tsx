import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TopoPattern } from "@/components/ui/topo-pattern";

type EmptyStateAction =
  | { label: string; onClick: () => void; href?: never }
  | { label: string; href: string; onClick?: never };

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  variant?: "card" | "inline";
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "card",
  className,
  children,
}: EmptyStateProps) {
  const isCard = variant === "card";

  return (
    <div
      data-slot="empty-state"
      className={cn(
        "text-center",
        isCard &&
          "relative overflow-hidden bg-card rounded-md border border-border p-8 card-noise",
        !isCard && "flex flex-col items-center justify-center px-4 py-10",
        className,
      )}
    >
      {isCard && <TopoPattern />}
      <div className={cn(isCard && "relative", !isCard && "contents")}>
        <Icon
          className={cn(
            "mx-auto mb-4 text-muted-foreground",
            isCard ? "size-12" : "mb-2 size-8",
          )}
        />
        <h2
          className={cn(
            isCard
              ? "text-xl font-semibold text-foreground mb-2 font-accent"
              : "text-sm font-medium text-foreground mb-1",
          )}
        >
          {title}
        </h2>
        {description && (
          <p
            className={cn(
              "text-muted-foreground",
              isCard && "mb-6",
              !isCard && "text-sm",
            )}
          >
            {description}
          </p>
        )}
        {action &&
          (action.href ? (
            <Button variant="gradient" className="h-12 px-8" asChild>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            <Button
              variant="gradient"
              className="h-12 px-8"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        {children}
      </div>
    </div>
  );
}
