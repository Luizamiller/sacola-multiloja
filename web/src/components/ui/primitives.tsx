import { cva, type VariantProps } from "class-variance-authority";
import { Minus, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background,color,border,transform] duration-150 active:translate-y-px disabled:opacity-45 disabled:pointer-events-none select-none",
  {
    variants: {
      variant: {
        primary: "bg-ink text-paper hover:bg-ink/90",
        accent: "bg-accent font-semibold text-on-accent shadow-[0_6px_16px_-8px_rgb(var(--sombra)/0.45)] hover:bg-accent-hover",
        outline: "border border-line-strong bg-surface text-ink hover:border-ink-3",
        ghost: "text-ink-2 hover:text-ink hover:bg-sunken",
        link: "text-accent-ink underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[13px] rounded-[8px]",
        md: "h-10 px-4 text-sm rounded-[var(--radius-control)]",
        lg: "h-12 px-5 text-[15px] rounded-[var(--radius-control)]",
        icon: "size-9 rounded-[var(--radius-control)]",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>>(
  ({ className, variant, size, ...p }, ref) => <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...p} />,
);
Button.displayName = "Button";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-sunken", className)} />;
}

export function Stepper({ value, onChange, max = 10, label, compact }: {
  value: number; onChange: (v: number) => void; max?: number; label: string; compact?: boolean;
}) {
  const h = compact ? "h-8" : "h-9";
  return (
    <div className={cn("inline-flex items-center rounded-[var(--radius-control)] border border-line-strong bg-surface", h)}>
      <button type="button" aria-label={`Remover uma unidade de ${label}`} onClick={() => onChange(value - 1)}
        className={cn("grid place-items-center text-ink-2 hover:text-ink", compact ? "w-7" : "w-9")}>
        <Minus className="size-3.5" strokeWidth={2} />
      </button>
      <span className="tnum min-w-5 text-center text-sm font-medium" aria-live="polite">{value}</span>
      <button type="button" aria-label={`Adicionar uma unidade de ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}
        className={cn("grid place-items-center text-ink-2 hover:text-ink disabled:opacity-40", compact ? "w-7" : "w-9")}>
        <Plus className="size-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

export function Sheet({ open, onOpenChange, title, description, children, side = "right", width = "w-[440px]" }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: ReactNode;
  side?: "right" | "bottom"; width?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-40 bg-[#43251f]/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
              <motion.div
                className={cn(
                  "fixed z-50 flex flex-col bg-surface shadow-[var(--shadow-flutuante)] outline-none",
                  side === "right" ? cn("inset-y-0 right-0 max-w-[100vw] border-l border-line", width) :
                    "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[18px] border-t border-line",
                )}
                initial={side === "right" ? { x: 40, opacity: 0 } : { y: 60, opacity: 0 }}
                animate={side === "right" ? { x: 0, opacity: 1 } : { y: 0, opacity: 1 }}
                exit={side === "right" ? { x: 40, opacity: 0 } : { y: 60, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
                  <div>
                    <Dialog.Title className="font-display text-xl">{title}</Dialog.Title>
                    {description ? <Dialog.Description className="mt-0.5 text-[13px] text-ink-3">{description}</Dialog.Description>
                      : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
                  </div>
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon" aria-label="Fechar"><X className="size-4" /></Button>
                  </Dialog.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

export function VegMark({ className }: { className?: string }) {
  return (
    <span title="Vegetariano" className={cn("inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ok", className)}>
      <span className="size-1.5 rounded-full bg-ok" aria-hidden />veg
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-sunken px-1.5 py-px font-sans text-[11px] text-ink-3">{children}</kbd>;
}
