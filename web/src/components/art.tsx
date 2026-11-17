import {
  CakeSlice, Coffee, Croissant, CupSoda, Egg, Fish, Flame, GlassWater, IceCreamBowl, Milk, Pill, Pizza, Salad, Sandwich,
  ShoppingBasket, Soup, UtensilsCrossed, Wheat, type LucideIcon,
} from "lucide-react";

import type { Item, Loja } from "@/lib/api";
import { cn } from "@/lib/utils";

export const ICONES: Record<string, LucideIcon> = {
  sandwich: Sandwich, fish: Fish, pizza: Pizza, salad: Salad, "cup-soda": CupSoda, "cake-slice": CakeSlice,
  croissant: Croissant, flame: Flame, "shopping-basket": ShoppingBasket, pill: Pill,
};

const POR_TERMO: [RegExp, LucideIcon, string][] = [
  [/burger|smash|veggie|hamb/i, Sandwich, "#FFE1B8"], [/pizza|lasanha/i, Pizza, "#FFE8A6"], [/poke|sushi|combinado/i, Fish, "#FFD5CC"],
  [/miss|sopa/i, Soup, "#F9DFC4"], [/açaí|cupuaçu|sorvete/i, IceCreamBowl, "#EAD6F5"], [/salada|bowl|quinoa/i, Salad, "#DCF0D0"],
  [/café/i, Coffee, "#EBD9C6"], [/croissant|pão/i, Croissant, "#F6E1C2"], [/bolo|brigadeiro|tiramis/i, CakeSlice, "#FFDCE5"],
  [/batata/i, Wheat, "#FFE7B0"], [/leite/i, Milk, "#E3EEF6"], [/ovo/i, Egg, "#FFF0C8"], [/água|suco|limonada/i, GlassWater, "#D9EEF4"],
  [/taco|burrito/i, Flame, "#FFD8BC"], [/protetor|escova|soro|termôm/i, Pill, "#D6F0E8"], [/queijo/i, UtensilsCrossed, "#F5E6C8"],
];

export function arteDoItem(item: Pick<Item, "nome" | "tipo">): [LucideIcon, string] {
  const achado = POR_TERMO.find(([re]) => re.test(item.nome));
  if (achado) return [achado[1], achado[2]];
  return item.tipo === "farmacia" ? [Pill, "#D6F0E8"] : item.tipo === "mercado" ? [ShoppingBasket, "#DCEBF5"] : [UtensilsCrossed, "#F7E3CB"];
}

/** Ilustração do item: foto licenciada quando existir; até lá, ícone sobre a cor do tipo de comida. */
export function ItemArte({ item, className, tamanho = "md" }: { item: Pick<Item, "nome" | "tipo" | "imagem">; className?: string; tamanho?: "sm" | "md" | "lg" }) {
  if (item.imagem) return <img src={item.imagem} alt="" loading="lazy" className={cn("object-cover", className)} />;
  const [Icone, cor] = arteDoItem(item);
  const icone = { sm: "size-6", md: "size-9", lg: "size-16" }[tamanho];
  return (
    <span aria-hidden className={cn("grid place-items-center text-[#43251f]/75", className)} style={{ background: cor }}>
      <Icone className={icone} strokeWidth={1.5} />
    </span>
  );
}

/** Capa da loja: cor da loja com ondas finas (sem fotos genéricas). */
export function CapaLoja({ loja, className, children }: { loja: Pick<Loja, "cor" | "imagem">; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("relative overflow-hidden", !loja.imagem && "seigaiha", className)} style={{ background: loja.cor }}>
      {loja.imagem && <img src={loja.imagem} alt="" className="absolute inset-0 size-full object-cover" />}
      {children}
    </div>
  );
}
