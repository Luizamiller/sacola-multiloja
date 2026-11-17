import { Check, Minus, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog } from "radix-ui";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { ItemArte } from "@/components/art";
import { useToast } from "@/components/toast";
import { Button, VegMark } from "@/components/ui/primitives";
import type { Item } from "@/lib/api";
import { useAcoesSacola, useCatalogo } from "@/lib/hooks";
import { cn, reais } from "@/lib/utils";

const Ctx = createContext<(item: Item) => void>(() => {});
export const useAbrirProduto = () => useContext(Ctx);

/** Folha do produto: opções obrigatórias e opcionais, observação, quantidade e preço calculado ao vivo. */
export function ProdutoProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<Item | null>(null);
  const abrir = useCallback((i: Item) => setItem(i), []);
  return (
    <Ctx.Provider value={abrir}>
      {children}
      <Dialog.Root open={!!item} onOpenChange={(v) => !v && setItem(null)}>
        <AnimatePresence>
          {item && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount>
                <motion.div className="fixed inset-0 z-40 bg-[#43251f]/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount>
                <motion.div
                  className="fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] flex-col overflow-hidden rounded-t-[24px] bg-surface outline-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[560px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[24px]"
                  initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
                  <Folha key={item.id} item={item} onFechar={() => setItem(null)} />
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </Ctx.Provider>
  );
}

function Folha({ item, onFechar }: { item: Item; onFechar: () => void }) {
  const { lojas } = useCatalogo();
  const { adicionar } = useAcoesSacola();
  const toast = useToast();
  const loja = lojas.get(item.loja);
  const [escolhas, setEscolhas] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(item.opcoes.filter((g) => g.min === 1 && g.max === 1).map((g) => [g.id, []])));
  const [qtd, setQtd] = useState(1);
  const [obs, setObs] = useState("");
  const extras = useMemo(() => item.opcoes.reduce((t, g) => t + g.itens.filter((o) => escolhas[g.id]?.includes(o.id)).reduce((s, o) => s + o.preco, 0), 0), [escolhas, item]);
  const faltando = item.opcoes.filter((g) => (escolhas[g.id]?.length ?? 0) < g.min);
  const total = (item.preco + extras) * qtd;

  const alternar = (gid: string, oid: string, max: number) => {
    setEscolhas((e) => {
      const atual = e[gid] ?? [];
      if (max === 1) return { ...e, [gid]: [oid] };
      if (atual.includes(oid)) return { ...e, [gid]: atual.filter((x) => x !== oid) };
      if (atual.length >= max) return e;
      return { ...e, [gid]: [...atual, oid] };
    });
  };
  const confirmar = () => {
    adicionar.mutate({ item_id: item.id, qtd, opcoes: escolhas, observacao: obs.trim() }, {
      onSuccess: () => {
        toast(`${qtd}× ${item.nome} na sacola`);
        window.dispatchEvent(new Event("umami-sacola-pulo"));
        onFechar();
      },
    });
  };

  return (
    <>
      <div className="relative">
        <ItemArte item={item} tamanho="lg" className="h-48 w-full sm:h-56" />
        <Dialog.Close asChild>
          <button aria-label="Fechar" className="absolute top-3 right-3 grid size-10 place-items-center rounded-full bg-surface/95 shadow-md"><X className="size-5" /></button>
        </Dialog.Close>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 pt-5 pb-4">
          <Dialog.Title className="font-display text-[24px] leading-tight font-semibold">{item.nome}</Dialog.Title>
          <Dialog.Description className="mt-1 text-[14.5px] text-ink-2">{item.descricao}</Dialog.Description>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="tnum font-display text-[20px] font-semibold">{reais(item.preco)}</span>
            {item.vegetariano && <VegMark />}
            {item.serve > 1 && <span className="text-[12px] text-ink-3">serve {item.serve}</span>}
          </div>
          {loja && <p className="mt-2 text-[13px] text-ink-3">{loja.nome} · {loja.prazo}–{loja.prazo_max} min</p>}
        </div>

        {item.opcoes.map((g) => {
          const sel = escolhas[g.id] ?? [];
          const obrigatorio = g.min > 0;
          const ok = sel.length >= g.min;
          return (
            <fieldset key={g.id} className="border-t border-line">
              <legend className="sr-only">{g.nome}</legend>
              <div className="sticky top-0 z-10 flex items-center justify-between bg-sunken px-5 py-3">
                <div>
                  <p className="font-semibold">{g.nome}</p>
                  <p className="text-[12.5px] text-ink-3">{g.max === 1 ? "Escolha 1" : `Escolha até ${g.max}`}</p>
                </div>
                {obrigatorio && (
                  <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide", ok ? "bg-ok-wash text-ok" : "bg-ink text-paper")}>
                    {ok ? <span className="inline-flex items-center gap-1"><Check className="size-3" strokeWidth={3} />ok</span> : "obrigatório"}
                  </span>
                )}
              </div>
              <ul>
                {g.itens.map((o) => {
                  const on = sel.includes(o.id);
                  const cheio = !on && g.max > 1 && sel.length >= g.max;
                  return (
                    <li key={o.id} className="border-b border-line/70 last:border-b-0">
                      <button type="button" role={g.max === 1 ? "radio" : "checkbox"} aria-checked={on} disabled={cheio}
                        onClick={() => alternar(g.id, o.id, g.max)}
                        className="flex w-full items-center gap-3 px-5 py-3.5 text-left disabled:opacity-45">
                        <span className="flex-1">
                          <span className="block text-[15px]">{o.nome}</span>
                          {o.preco > 0 && <span className="tnum text-[13px] text-ink-2">+ {reais(o.preco)}</span>}
                        </span>
                        <span className={cn("grid size-6 place-items-center border-2 transition-colors", g.max === 1 ? "rounded-full" : "rounded-[7px]",
                          on ? "border-marca-700 bg-marca-700 text-white" : "border-line-strong")}>
                          {on && (g.max === 1 ? <span className="size-2 rounded-full bg-white" /> : <Check className="size-3.5" strokeWidth={3} />)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}

        <div className="border-t border-line px-5 py-4">
          <label htmlFor="obs" className="flex items-center justify-between text-[14px] font-semibold">Alguma observação? <span className="tnum text-[12px] font-normal text-ink-3">{obs.length}/140</span></label>
          <textarea id="obs" rows={2} maxLength={140} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: tirar a cebola, maionese à parte"
            className="mt-2 w-full resize-none rounded-[12px] border border-line-strong bg-paper p-3 text-[14px] outline-none focus:border-marca-700" />
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-line bg-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex h-12 items-center rounded-full border border-line-strong">
          <button aria-label="Diminuir" onClick={() => setQtd((q) => Math.max(1, q - 1))} className="grid h-full w-11 place-items-center text-marca-700 disabled:opacity-30" disabled={qtd <= 1}><Minus className="size-4" /></button>
          <span className="tnum w-6 text-center font-semibold" aria-live="polite">{qtd}</span>
          <button aria-label="Aumentar" onClick={() => setQtd((q) => Math.min(10, q + 1))} className="grid h-full w-11 place-items-center text-marca-700"><Plus className="size-4" /></button>
        </div>
        <Button variant="accent" size="lg" className="flex-1 justify-between rounded-full px-5" onClick={confirmar}
          disabled={faltando.length > 0 || adicionar.isPending || !item.disponivel}>
          <span>{!item.disponivel ? "Indisponível" : faltando.length ? `Escolha: ${faltando[0].nome.toLowerCase()}` : "Adicionar"}</span>
          <span className="tnum">{reais(total)}</span>
        </Button>
      </div>
    </>
  );
}
