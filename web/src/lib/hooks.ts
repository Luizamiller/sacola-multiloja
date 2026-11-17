import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { animate } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, type Item, type Loja, type Sacola } from "./api";
import { useToast } from "@/components/toast";

export function useCatalogo() {
  const q = useQuery({ queryKey: ["catalogo"], queryFn: api.catalogo, staleTime: Infinity });
  const indices = useMemo(() => {
    const lojas = new Map<string, Loja>();
    const itens = new Map<string, Item>();
    q.data?.lojas.forEach((l) => lojas.set(l.id, l));
    q.data?.itens.forEach((i) => itens.set(i.id, i));
    return { lojas, itens };
  }, [q.data]);
  return { ...q, ...indices };
}

export function useSacola() {
  return useQuery({ queryKey: ["sacola"], queryFn: api.sacola });
}

export function useAcoesSacola() {
  const qc = useQueryClient();
  const toast = useToast();
  const set = (s: Sacola) => qc.setQueryData(["sacola"], s);
  const onError = (e: Error) => toast(e.message, "erro");

  const definir = useMutation({
    mutationFn: ({ id, qtd }: { id: string; qtd: number }) => api.definirItem(id, qtd),
    onMutate: async ({ id, qtd }) => {
      await qc.cancelQueries({ queryKey: ["sacola"] });
      const antes = qc.getQueryData<Sacola>(["sacola"]);
      if (antes) {
        const existe = antes.itens.some((i) => i.id === id);
        const itens = qtd <= 0 ? antes.itens.filter((i) => i.id !== id)
          : existe ? antes.itens.map((i) => (i.id === id ? { ...i, qtd } : i)) : antes.itens;
        qc.setQueryData(["sacola"], { ...antes, itens });
      }
      return { antes };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(["sacola"], ctx.antes);
      onError(e as Error);
    },
    onSuccess: set,
  });
  const linha = useMutation({
    mutationFn: ({ id, qtd }: { id: number; qtd: number }) => api.alterarLinha(id, qtd),
    onMutate: async ({ id, qtd }) => {
      await qc.cancelQueries({ queryKey: ["sacola"] });
      const antes = qc.getQueryData<Sacola>(["sacola"]);
      if (antes) qc.setQueryData(["sacola"], { ...antes, itens: qtd <= 0 ? antes.itens.filter((i) => i.linha_id !== id) : antes.itens.map((i) => (i.linha_id === id ? { ...i, qtd } : i)) });
      return { antes };
    },
    onError: (e, _v, ctx) => { if (ctx?.antes) qc.setQueryData(["sacola"], ctx.antes); onError(e as Error); },
    onSuccess: set,
  });
  const adicionar = useMutation({ mutationFn: api.adicionarLinha, onSuccess: set, onError });
  const cupom = useMutation({ mutationFn: api.cupom, onSuccess: set, onError });
  const separar = useMutation({ mutationFn: api.separar, onSuccess: set, onError });
  const aplicar = useMutation({
    mutationFn: ({ itens, modo }: { itens: Record<string, number>; modo: "substituir" | "somar" }) => api.aplicar(itens, modo),
    onSuccess: set, onError,
  });
  const esvaziar = useMutation({ mutationFn: api.esvaziar, onSuccess: set, onError });
  return { definir, linha, adicionar, cupom, separar, aplicar, esvaziar };
}

export function useFavoritos() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["favoritos"], queryFn: api.favoritos });
  const ids = useMemo(() => new Set(q.data?.map((i) => i.id)), [q.data]);
  const alternar = useMutation({
    mutationFn: (id: string) => (ids.has(id) ? api.desfavoritar(id) : api.favoritar(id)),
    onSuccess: (d) => qc.setQueryData(["favoritos"], d),
  });
  return { ...q, ids, alternar };
}

/** Número que desliza até o novo valor (totais e taxas), respeitando prefers-reduced-motion. */
export function useNumeroAnimado(valor: number, duracao = 0.45) {
  const [v, setV] = useState(valor);
  const anterior = useRef(valor);
  useEffect(() => {
    const reduz = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduz) { setV(valor); anterior.current = valor; return; }
    const c = animate(anterior.current, valor, { duration: duracao, ease: [0.22, 1, 0.36, 1], onUpdate: setV });
    anterior.current = valor;
    return () => c.stop();
  }, [valor, duracao]);
  return v;
}

export function useTema() {
  const [escuro, setEscuro] = useState(() => {
    try {
      const s = localStorage.getItem("tema");
      return s ? s === "escuro" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", escuro);
    try { localStorage.setItem("tema", escuro ? "escuro" : "claro"); } catch { /* armazenamento indisponível */ }
  }, [escuro]);
  return [escuro, setEscuro] as const;
}

export function useEu() {
  return useQuery({ queryKey: ["eu"], queryFn: api.eu, staleTime: 60_000 });
}
