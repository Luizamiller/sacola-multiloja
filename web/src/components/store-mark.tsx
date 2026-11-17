import { cn, iniciais } from "@/lib/utils";

/** Monograma tipográfico da loja — identidade sem fotos genéricas. */
export function StoreMark({ nome, cor, size = "md", className }: {
  nome: string; cor: string; size?: "sm" | "md" | "lg"; className?: string;
}) {
  const dim = { sm: "size-7 text-[11px] rounded-[7px]", md: "size-10 text-[13px] rounded-[10px]", lg: "size-16 text-xl rounded-[14px]" }[size];
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center font-display font-semibold tracking-tight text-white", dim, className)}
      style={{ background: cor }}>
      {iniciais(nome)}
    </span>
  );
}
