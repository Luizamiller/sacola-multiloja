import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const reais = (v: number) => brl.format(v).replace(/ /g, " ");
export const km = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;

export const TIPOS: Record<string, string> = {
  prato: "Pratos", acompanhamento: "Acompanhamentos", sobremesa: "Sobremesas", bebida: "Bebidas",
  farmacia: "Farmácia", mercado: "Mercearia",
};
export const ORDEM_TIPOS = ["prato", "acompanhamento", "bebida", "sobremesa", "mercado", "farmacia"];

export function iniciais(nome: string) {
  return nome.replace(/&/g, "").split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]/.test(p)).slice(0, 2)
    .map((p) => p[0]).join("").toUpperCase();
}
