import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, Plus, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { ICONES, ItemArte } from "@/components/art";
import { Mascote } from "@/components/brand";
import { useAbrirProduto } from "@/components/product-sheet";
import { Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useCatalogo } from "@/lib/hooks";
import { cn, reais } from "@/lib/utils";
import { LojaCard } from "./home";

const SUGESTOES = ["poke", "pizza", "hambúrguer", "açaí", "salada", "café", "farmácia", "brigadeiro"];

function useHistorico(): [string[], (t: string) => void, () => void] {
  const ler = () => { try { return JSON.parse(localStorage.getItem("umami-buscas") ?? "[]") as string[]; } catch { return []; } };
  const [h, setH] = useState<string[]>(ler);
  const add = (t: string) => {
    const novo = [t, ...h.filter((x) => x !== t)].slice(0, 8);
    setH(novo);
    try { localStorage.setItem("umami-buscas", JSON.stringify(novo)); } catch { /* sem armazenamento */ }
  };
  const limpar = () => { setH([]); try { localStorage.removeItem("umami-buscas"); } catch { /* ignora */ } };
  return [h, add, limpar];
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const categoria = params.get("categoria");
  const [texto, setTexto] = useState(q);
  const [aba, setAba] = useState<"lojas" | "itens">("lojas");
  const [historico, addHistorico, limparHistorico] = useHistorico();
  const navigate = useNavigate();
  const { data: cat, lojas } = useCatalogo();
  const abrirProduto = useAbrirProduto();

  useEffect(() => { setTexto(q); }, [q]);
  useEffect(() => { // busca enquanto digita, com pequena espera
    const t = setTimeout(() => {
      if (texto.trim() !== q) setParams(texto.trim() ? { q: texto.trim() } : {}, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [texto]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isFetching } = useQuery({ queryKey: ["busca", q], queryFn: () => api.busca(q), enabled: q.length >= 2, placeholderData: keepPreviousData });
  const catSel = cat?.categorias.find((c) => c.id === categoria);
  const lojasCategoria = useMemo(() => catSel ? cat!.lojas.filter((l) => catSel.lojas.includes(l.id)) : [], [cat, catSel]);
  useEffect(() => { if (data && q) { addHistorico(q); setAba(data.lojas.length || !data.itens.length ? "lojas" : "itens"); } }, [data?.lojas.length, data?.itens.length, q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-[860px]">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} aria-label="Voltar" className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-sunken"><ArrowLeft className="size-5" /></button>
        <form onSubmit={(e) => { e.preventDefault(); setParams(texto.trim() ? { q: texto.trim() } : {}); }}
          className="flex h-12 flex-1 items-center gap-2 rounded-full bg-surface px-4 ring-2 ring-marca-700/50">
          <Search className="size-4 text-ink-3" />
          <label htmlFor="busca" className="sr-only">Buscar</label>
          <input id="busca" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Item ou loja" enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3" />
          {texto && <button type="button" onClick={() => setTexto("")} aria-label="Limpar busca" className="text-ink-3 hover:text-ink"><X className="size-4" /></button>}
        </form>
      </div>

      {catSel ? (
        <section className="mt-6">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-[14px]" style={{ background: catSel.cor }}>
              {(() => { const I = ICONES[catSel.icone]; return I ? <I className="size-6 text-[#43251f]" /> : null; })()}
            </span>
            <h1 className="text-[26px]">{catSel.nome}</h1>
            <Link to="/busca" className="ml-auto text-[13px] font-semibold text-accent-ink">Limpar</Link>
          </div>
          <ul className="mt-2">{lojasCategoria.map((l, i) => <LojaCard key={l.id} loja={l} i={i} />)}</ul>
        </section>
      ) : q.length < 2 ? (
        <div className="mt-8 space-y-8">
          {historico.length > 0 && (
            <section>
              <div className="flex items-center justify-between"><h2 className="text-[18px]">Buscas recentes</h2>
                <button onClick={limparHistorico} className="text-[13px] font-semibold text-accent-ink">Limpar</button></div>
              <ul className="mt-2">
                {historico.map((h) => (
                  <li key={h}><button onClick={() => setTexto(h)} className="flex w-full items-center gap-3 py-2.5 text-left text-[15px] hover:text-marca-700"><Clock className="size-4 text-ink-3" />{h}</button></li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2 className="text-[18px]">Sugestões</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGESTOES.map((s) => <button key={s} onClick={() => setTexto(s)} className="rounded-full bg-surface px-4 py-2 text-[14px] font-semibold ring-1 ring-line hover:ring-line-strong">{s}</button>)}
            </div>
          </section>
          <section>
            <h2 className="text-[18px]">Categorias</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {cat?.categorias.map((c) => {
                const I = ICONES[c.icone];
                return (
                  <Link key={c.id} to={`/busca?categoria=${c.id}`} className="flex h-20 items-end justify-between rounded-[16px] p-3 font-semibold" style={{ background: c.cor, color: "#43251f" }}>
                    {c.nome}{I && <I className="size-7 opacity-80" strokeWidth={1.6} />}
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <div className="mt-6">
          <div role="tablist" className="flex gap-6 border-b border-line">
            {(["lojas", "itens"] as const).map((a) => (
              <button key={a} role="tab" aria-selected={aba === a} onClick={() => setAba(a)}
                className={cn("-mb-px border-b-[3px] pb-2.5 text-[15px] font-semibold", aba === a ? "border-marca text-ink" : "border-transparent text-ink-3")}>
                {a === "lojas" ? "Lojas" : "Itens"} <span className="tnum text-ink-3">{data ? (a === "lojas" ? data.lojas.length : data.itens.length) : ""}</span>
              </button>
            ))}
          </div>
          {isFetching && !data && <div className="mt-4 space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>}
          {data && !data.lojas.length && !data.itens.length && (
            <div className="flex flex-col items-center py-14 text-center">
              <Mascote tamanho={80} vivo={false} />
              <p className="mt-4 font-display text-[19px] font-semibold">Nada encontrado para “{q}”</p>
              <p className="mt-1 text-[14px] text-ink-3">Tente outro termo, ou peça ao assistente para montar o pedido.</p>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div key={aba} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {aba === "lojas" ? (
                <ul>{data?.lojas.map((l, i) => <LojaCard key={l.id} loja={l} i={i} />)}</ul>
              ) : (
                <ul className="divide-y divide-line">
                  {data?.itens.map((i) => (
                    <li key={i.id}>
                      <button onClick={() => abrirProduto(i)} disabled={!i.disponivel} className="flex w-full items-center gap-4 py-4 text-left disabled:opacity-50">
                        <ItemArte item={i} className="size-[76px] shrink-0 rounded-[14px]" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{i.nome}</span>
                          <span className="line-clamp-1 block text-[13px] text-ink-3">{i.descricao}</span>
                          <span className="block text-[12.5px] text-ink-2">{lojas.get(i.loja)?.nome}</span>
                          <span className="tnum mt-1 block font-semibold">{reais(i.preco)}</span>
                        </span>
                        {i.disponivel && <span className="grid size-9 place-items-center rounded-full bg-accent text-on-accent"><Plus className="size-4" strokeWidth={2.6} /></span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
