import { ArrowRight, Info, Route, Split, Ticket, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { Button, Skeleton, Stepper } from "@/components/ui/primitives";
import { StoreMark } from "@/components/store-mark";
import { Mascote } from "@/components/brand";
import type { Sacola } from "@/lib/api";
import { useAcoesSacola, useCatalogo, useNumeroAnimado, useSacola } from "@/lib/hooks";
import { cn, reais } from "@/lib/utils";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";

export function Total({ valor, className }: { valor: number; className?: string }) {
  const v = useNumeroAnimado(valor);
  return <span className={cn("tnum", className)}>{reais(v)}</span>;
}

export function BagPanel({ onNavigate, variante = "rail" }: { onNavigate?: () => void; variante?: "rail" | "sheet" }) {
  const { data, isLoading } = useSacola();
  const { lojas } = useCatalogo();
  const { definir, linha, separar, esvaziar } = useAcoesSacola();
  const navigate = useNavigate();
  const toast = useToast();
  const [salvando, setSalvando] = useState(false);

  if (isLoading || !data) {
    return <div className="space-y-3 p-6"><Skeleton className="h-5 w-32" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;
  }
  const { itens, plano } = data;
  if (!itens.length || !plano) return <BagVazia onNavigate={onNavigate} />;

  const porLoja = plano.lojas.map((l) => ({ ...l, itens: itens.filter((i) => i.loja === l.id) }));
  const bloqueios = plano.problemas;

  const alternarSeparada = (lojaId: string) => {
    const atual = data.lojas_separadas;
    separar.mutate(atual.includes(lojaId) ? atual.filter((l) => l !== lojaId) : [...atual, lojaId]);
  };

  const salvarLista = async (nome: string) => {
    setSalvando(true);
    try { await api.criarLista(nome); toast(`Lista "${nome}" salva`); } catch (e) { toast((e as Error).message, "erro"); }
    setSalvando(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex-1 overflow-y-auto", variante === "rail" ? "px-5 pb-4" : "px-6 pb-6")}>
        <div className="flex items-baseline justify-between py-4">
          <p className="text-[13px] text-ink-3">
            {itens.reduce((a, i) => a + i.qtd, 0)} itens · {plano.lojas.length} de 4 lojas
          </p>
          <button onClick={() => esvaziar.mutate()} className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-danger">
            <Trash2 className="size-3.5" /> Esvaziar
          </button>
        </div>

        <ol className="space-y-5">
          <AnimatePresence initial={false}>
            {porLoja.map((l) => {
              const loja = lojas.get(l.id);
              const falta = Math.max(0, l.minimo - l.subtotal);
              return (
                <motion.li key={l.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22 }}>
                  <div className="flex items-center gap-2.5">
                    {loja && <StoreMark nome={loja.nome} cor={loja.cor} size="sm" />}
                    <Link to={`/loja/${l.id}`} onClick={onNavigate} className="min-w-0 flex-1 truncate text-[14px] font-medium hover:underline">
                      {l.nome}
                    </Link>
                    <span className="tnum text-[13px] text-ink-2">{reais(l.subtotal)}</span>
                  </div>
                  {falta > 0 && (
                    <div className="mt-2 ml-9">
                      <div className="h-1 overflow-hidden rounded-full bg-sunken">
                        <motion.div className="h-full bg-warn" initial={false} animate={{ width: `${(l.subtotal / l.minimo) * 100}%` }} />
                      </div>
                      <p className="mt-1 text-[12px] text-warn">Faltam {reais(falta)} para o mínimo de {reais(l.minimo)}</p>
                    </div>
                  )}
                  <ul className="mt-2 ml-9 divide-y divide-line">
                    {l.itens.map((i) => (
                      <li key={i.linha_id ?? i.id} className="flex items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold">{i.nome}</p>
                          {!!i.detalhes?.length && <p className="line-clamp-2 text-[12px] text-ink-3">{i.detalhes.join(" · ")}</p>}
                          {i.observacao && <p className="line-clamp-1 text-[12px] text-ink-3 italic">“{i.observacao}”</p>}
                          <p className="tnum text-[12.5px] text-ink-2">{reais((i.preco_unitario ?? i.preco) * i.qtd)}</p>
                        </div>
                        <Stepper compact value={i.qtd} label={i.nome}
                          onChange={(q) => (i.linha_id ? linha.mutate({ id: i.linha_id, qtd: q }) : definir.mutate({ id: i.id, qtd: q }))} />
                      </li>
                    ))}
                  </ul>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>

        <section className="mt-6 border-t border-line pt-4" aria-labelledby="entregas">
          <h3 id="entregas" className="flex items-center gap-2 font-sans text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            <Route className="size-3.5" /> Entregas
          </h3>
          <ul className="mt-3 space-y-3">
            {plano.entregas.map((e, idx) => (
              <li key={idx} className="rounded-[10px] border border-line px-3.5 py-3">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="font-medium">
                    {e.combinada ? "Entrega combinada" : e.separada_pelo_cliente ? "Separada por você" : "Entrega própria"}
                  </span>
                  <span className="tnum text-ink-2">{e.prazo} min · {reais(e.taxa)}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-3">{e.lojas.map((id) => lojas.get(id)?.nome).join(" + ")}</p>
                {e.combinada && (
                  <p className="mt-1 text-[12px] text-ok">Economia de {reais(e.taxa_separada - e.taxa)} em relação a entregas separadas</p>
                )}
                {(e.combinada || e.separada_pelo_cliente) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {e.lojas.map((id) => (
                      <button key={id} onClick={() => alternarSeparada(id)}
                        className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2 hover:border-ink-3">
                        <Split className="size-3" />
                        {e.separada_pelo_cliente ? "Juntar de novo" : `Separar ${lojas.get(id)?.nome.split(" ")[0]}`}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {plano.entregas.some((e) => e.combinada) && (
            <p className="mt-2 flex gap-1.5 text-[11px] leading-snug text-ink-3">
              <Info className="mt-px size-3 shrink-0" /> Lojas a até 2 km entre si saem juntas: maior taxa + R$ 1,99 e +5 min por loja extra.
            </p>
          )}
        </section>
      </div>

      <Resumo sacola={data} bloqueios={bloqueios.map((b) => b.mensagem)} salvando={salvando} onSalvar={salvarLista}
        onCheckout={() => { onNavigate?.(); navigate("/checkout"); }} />
    </div>
  );
}

function Resumo({ sacola, bloqueios, onCheckout, onSalvar, salvando }: {
  sacola: Sacola; bloqueios: string[]; onCheckout: () => void; onSalvar: (nome: string) => Promise<void>; salvando: boolean;
}) {
  const p = sacola.plano!;
  const [nomeando, setNomeando] = useState(false);
  const [nome, setNome] = useState("Pedido de sempre");
  return (
    <div className="border-t border-line bg-surface px-5 py-4">
      <CampoCupom sacola={sacola} />
      <dl className="mt-3 space-y-1 text-[13px]">
        <div className="flex justify-between text-ink-2"><dt>Itens</dt><dd className="tnum">{reais(p.total_itens)}</dd></div>
        <div className="flex justify-between text-ink-2"><dt>Entrega</dt><dd className="tnum">{reais(p.total_taxas)}</dd></div>
        {p.economia > 0 && <div className="flex justify-between text-ok"><dt>Economia combinada</dt><dd className="tnum">− {reais(p.economia)}</dd></div>}
        {!!p.desconto && <div className="flex justify-between text-ok"><dt>Cupom {sacola.cupom?.codigo}</dt><dd className="tnum">− {reais(p.desconto)}</dd></div>}
        <div className="flex items-baseline justify-between pt-2">
          <dt className="font-medium">Total · {p.prazo} min</dt>
          <dd><Total valor={p.total_final ?? p.total} className="font-display text-[22px] font-semibold" /></dd>
        </div>
      </dl>
      {bloqueios.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-[10px] bg-warn-wash px-3 py-2 text-[12px] text-warn">
          {bloqueios.map((b) => <li key={b}>{b}</li>)}
        </ul>
      )}
      {nomeando && (
        <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (nome.trim()) { await onSalvar(nome.trim()); setNomeando(false); } }}>
          <label className="sr-only" htmlFor="nome-lista">Nome da lista</label>
          <input id="nome-lista" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80}
            className="h-10 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-sm outline-none focus:border-ink-3" />
          <Button type="submit" variant="primary" disabled={salvando}>Salvar lista</Button>
        </form>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="lg" className="px-3" onClick={() => setNomeando((v) => !v)} aria-expanded={nomeando}>
          Salvar lista
        </Button>
        <Button variant="accent" size="lg" className="flex-1" disabled={!p.pode_finalizar} onClick={onCheckout}>
          Revisar pedido <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function CampoCupom({ sacola }: { sacola: Sacola }) {
  const { cupom } = useAcoesSacola();
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const c = sacola.cupom;
  if (c?.codigo) {
    return (
      <div className={cn("flex items-center gap-2 rounded-[12px] px-3 py-2 text-[13px]", c.valido ? "bg-ok-wash text-ok" : "bg-warn-wash text-warn")}>
        <Ticket className="size-4 shrink-0" />
        <span className="flex-1"><span className="font-bold">{c.codigo}</span> · {c.valido ? `− ${reais(c.desconto)}` : c.motivo}</span>
        <button onClick={() => cupom.mutate(null)} className="font-semibold underline-offset-2 hover:underline">Remover</button>
      </div>
    );
  }
  return aberto ? (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (codigo.trim()) cupom.mutate(codigo.trim(), { onSuccess: () => setAberto(false) }); }}>
      <label htmlFor="cupom" className="sr-only">Código do cupom</label>
      <input id="cupom" autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Código do cupom"
        className="h-10 min-w-0 flex-1 rounded-[10px] border border-line-strong bg-paper px-3 text-[14px] uppercase outline-none focus:border-marca-700" />
      <Button type="submit" variant="primary" disabled={cupom.isPending}>Aplicar</Button>
    </form>
  ) : (
    <button onClick={() => setAberto(true)} className="flex w-full items-center gap-2 text-[13.5px] font-semibold text-accent-ink"><Ticket className="size-4" /> Adicionar cupom</button>
  );
}

function BagVazia({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-16 text-center">
      <Mascote tamanho={72} vivo={false} />
      <p className="mt-5 font-display text-lg">Sua sacola está vazia</p>
      <p className="mt-1 max-w-[260px] text-[13px] text-ink-3">
        Combine até quatro lojas num só pedido. Lojas próximas dividem a mesma entrega.
      </p>
      <Link to="/favoritos" onClick={onNavigate} className="mt-4 text-[13px] font-medium text-accent-ink hover:underline">
        Repetir uma lista salva
      </Link>
    </div>
  );
}
