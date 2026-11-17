import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUp, Check, CircleAlert, CornerDownRight, LoaderCircle, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { Button, Sheet, Skeleton } from "@/components/ui/primitives";
import { StoreMark } from "@/components/store-mark";
import { api, type PropostaSacola, type RespostaAssistente } from "@/lib/api";
import { useAcoesSacola, useCatalogo } from "@/lib/hooks";
import { cn, reais } from "@/lib/utils";
import { useToast } from "@/components/toast";

type Ctx = { abrir: (pedido?: string) => void };
const AssistenteCtx = createContext<Ctx>({ abrir: () => {} });
export const useAssistente = () => useContext(AssistenteCtx);

export function AssistenteProvider({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const consulta = useMutation({ mutationFn: api.assistente });

  const abrir = useCallback((pedido?: string) => {
    setAberto(true);
    if (pedido?.trim()) {
      setTexto(pedido);
      consulta.mutate(pedido.trim());
    }
  }, [consulta]);

  return (
    <AssistenteCtx.Provider value={{ abrir }}>
      {children}
      <Sheet open={aberto} onOpenChange={setAberto} title="Montar com o assistente" width="w-[520px]"
        description="Descreva o pedido. A sugestão só vale depois de passar pelas regras da sacola.">
        <div className="px-6 py-5">
          <Composer valor={texto} onChange={setTexto} carregando={consulta.isPending} onEnviar={(t) => consulta.mutate(t)} />
          <div className="mt-6">
            {consulta.isPending && <Carregando />}
            {consulta.isError && <p className="text-sm text-danger">{(consulta.error as Error).message}</p>}
            {consulta.data && !consulta.isPending && <Resultado r={consulta.data} onFechar={() => setAberto(false)} />}
            {!consulta.data && !consulta.isPending && <Exemplos onEscolher={(t) => { setTexto(t); consulta.mutate(t); }} />}
          </div>
        </div>
      </Sheet>
    </AssistenteCtx.Provider>
  );
}

export function Composer({ valor, onChange, onEnviar, carregando, grande }: {
  valor: string; onChange: (v: string) => void; onEnviar: (v: string) => void; carregando?: boolean; grande?: boolean;
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (valor.trim().length >= 3) onEnviar(valor.trim()); }}
      className={cn("group relative flex items-end rounded-[var(--radius-panel)] border border-line-strong bg-surface transition-colors focus-within:border-ink-3",
        grande ? "p-2 pl-5" : "p-1.5 pl-4")}>
      <label htmlFor={grande ? "pedido-home" : "pedido"} className="sr-only">O que você quer pedir?</label>
      <textarea id={grande ? "pedido-home" : "pedido"} rows={grande ? 2 : 2} value={valor} maxLength={400}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (valor.trim().length >= 3) onEnviar(valor.trim()); } }}
        placeholder="Jantar para três pessoas com sobremesa, até R$ 130"
        className={cn("min-w-0 flex-1 resize-none bg-transparent py-2 leading-snug outline-none placeholder:text-ink-3", grande ? "text-[17px]" : "text-[15px]")} />
      <Button type="submit" variant="primary" size="icon" aria-label="Montar sacola" disabled={carregando || valor.trim().length < 3}
        className={grande ? "size-11" : undefined}>
        {carregando ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
      </Button>
    </form>
  );
}

function Exemplos({ onEscolher }: { onEscolher: (t: string) => void }) {
  const { data } = useQuery({ queryKey: ["exemplos"], queryFn: api.exemplos, staleTime: Infinity });
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Experimente</p>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {data?.map((e) => (
          <li key={e}>
            <button onClick={() => onEscolher(e)} className="flex w-full items-center gap-3 py-3 text-left text-sm text-ink-2 hover:text-ink">
              <CornerDownRight className="size-3.5 text-ink-3" /> {e}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Carregando() {
  const etapas = ["Entendendo o pedido", "Consultando o cardápio", "Validando regras da sacola"];
  return (
    <div className="space-y-4" aria-live="polite">
      <ol className="space-y-2">
        {etapas.map((e, i) => (
          <motion.li key={e} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.35 }}
            className="flex items-center gap-2 text-[13px] text-ink-2">
            <LoaderCircle className="size-3.5 animate-spin text-ink-3" /> {e}
          </motion.li>
        ))}
      </ol>
      <Skeleton className="h-24" /><Skeleton className="h-16" />
    </div>
  );
}

function Resultado({ r, onFechar }: { r: RespostaAssistente; onFechar: () => void }) {
  const { aplicar } = useAcoesSacola();
  const toast = useToast();
  const usar = (p: PropostaSacola, modo: "substituir" | "somar") => {
    aplicar.mutate(
      { itens: Object.fromEntries(p.itens.map((i) => [i.id, i.qtd])), modo },
      { onSuccess: () => { toast(modo === "substituir" ? "Sacola substituída pela sugestão" : "Itens somados à sacola"); onFechar(); } },
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-6">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Entendi assim</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.restricoes.rotulos.length ? r.restricoes.rotulos.map((t) => (
            <span key={t} className="rounded-full border border-line bg-sunken px-2.5 py-1 text-[12px] text-ink-2">{t}</span>
          )) : <span className="text-[13px] text-ink-3">Nenhuma restrição específica.</span>}
        </div>
      </div>

      {r.aviso && <p className="rounded-[10px] bg-warn-wash px-3 py-2 text-[13px] text-warn">{r.aviso}</p>}

      {r.status === "pronta" && r.proposta ? (
        <>
          <div>
            <p className="font-display text-[19px] leading-snug">{r.resumo}</p>
          </div>
          <PropostaView p={r.proposta} />
          {r.validacao && <Checklist checks={r.validacao.checks} />}
          <div className="flex gap-2">
            <Button variant="accent" size="lg" className="flex-1" onClick={() => usar(r.proposta!, "substituir")} disabled={aplicar.isPending}>
              Usar esta sacola
            </Button>
            <Button variant="outline" size="lg" onClick={() => usar(r.proposta!, "somar")} disabled={aplicar.isPending}>Somar</Button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-[12px] border border-line px-4 py-3.5">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
            <div className="space-y-1 text-[14px]">
              <p className="font-medium">Não dá para montar exatamente isso</p>
              {r.motivos.map((m) => <p key={m} className="text-ink-2">{m}</p>)}
            </div>
          </div>
          {r.alternativa && (
            <div className="space-y-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Alternativa mais próxima</p>
              <p className="text-[13px] text-ink-2">{r.alternativa_descricao}</p>
              <PropostaView p={r.alternativa} />
              <Button variant="outline" className="w-full" onClick={() => usar(r.alternativa!, "substituir")}>Usar a alternativa</Button>
            </div>
          )}
        </div>
      )}

      <p className="border-t border-line pt-3 text-[11px] text-ink-3">
        {r.motor === "claude" ? "Sugestão do Claude" : "Planejador determinístico (sem modelo de linguagem)"}
        {" · "}{typeof r.metricas.ms === "number" ? `${r.metricas.ms} ms` : ""}
        {typeof r.metricas.passos === "number" && r.metricas.passos ? ` · ${r.metricas.passos} chamadas` : ""}
        {" · "}preços, taxas e prazos calculados pelas regras da sacola
      </p>
    </motion.div>
  );
}

function PropostaView({ p }: { p: PropostaSacola }) {
  const { lojas } = useCatalogo();
  return (
    <div className="rounded-[12px] border border-line">
      {p.plano.lojas.map((l) => {
        const loja = lojas.get(l.id);
        return (
          <div key={l.id} className="border-b border-line px-4 py-3 last:border-b-0">
            <div className="flex items-center gap-2">
              {loja && <StoreMark nome={loja.nome} cor={loja.cor} size="sm" />}
              <span className="flex-1 text-[13px] font-medium">{l.nome}</span>
              <span className="tnum text-[13px] text-ink-2">{reais(l.subtotal)}</span>
            </div>
            <ul className="mt-1.5 ml-9 space-y-0.5">
              {p.itens.filter((i) => i.loja === l.id).map((i) => (
                <li key={i.id} className="flex justify-between text-[13px] text-ink-2">
                  <span><span className="tnum text-ink">{i.qtd}×</span> {i.nome}</span>
                  <span className="tnum">{reais(i.preco * i.qtd)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <div className="flex items-baseline justify-between bg-sunken px-4 py-3 text-[13px]">
        <span className="text-ink-2">
          {p.plano.entregas.length === 1 && p.plano.entregas[0].combinada ? "Entrega combinada" : `${p.plano.entregas.length} entrega(s)`}
          {" · "}{reais(p.plano.total_taxas)} · {p.plano.prazo} min
        </span>
        <span className="tnum font-display text-lg font-semibold">{reais(p.plano.total)}</span>
      </div>
    </div>
  );
}

function Checklist({ checks }: { checks: { id: string; rotulo: string; ok: boolean; detalhes: string[] }[] }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Validação determinística</p>
      <ul className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        <AnimatePresence>
          {checks.map((c, i) => (
            <motion.li key={c.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}
              className="flex items-start gap-2 text-[12.5px] text-ink-2">
              {c.ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-ok" strokeWidth={2.5} /> : <X className="mt-0.5 size-3.5 shrink-0 text-danger" />}
              {c.rotulo}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
