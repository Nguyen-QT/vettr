"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  isConfirming?: boolean;
  // Visual weight only -- "destructive" styles the confirm button red
  // for a genuinely destructive action (cancel, decline); no other
  // behavior differs. Zero domain awareness -- this component has no
  // idea what action it's confirming (CLAUDE.md 9.1.1).
  variant?: "default" | "destructive";
}

// UI Primitive & Config (CLAUDE.md 9.1.1): a generic, controlled
// confirm/cancel dialog reused by every destructive or state-changing
// action across both portals. Deliberately dumb -- it takes an
// onConfirm callback and renders whatever open/pending state its
// caller (useConfirmAction, 9.1.2) hands it; it never decides when to
// open itself or what happens after confirming.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  isConfirming = false,
  variant = "default",
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isConfirming}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isConfirming}
            onClick={onConfirm}
            className={cn(
              variant === "destructive" &&
                buttonVariants({ variant: "destructive" })
            )}
          >
            {isConfirming ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
