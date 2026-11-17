import { ArrowLeft, Clock, Heart, Info, Plus, Search, Star, Ticket } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { CapaLoja, ItemArte } from "@/components/art";
import { useAbrirProduto } from "@/components/product-sheet";
import { StoreMark } from "@/components/store-mark";
import { Skeleton, VegMark } from "@/components/ui/primitives";
import type { Item } from "@/lib/api";
import { useCatalogo, useFavoritos, useSacola } from "@/lib/hooks";
import { cn, km, ORDEM_TIPOS, reais, TIPOS } from "@/lib/utils";

export function StorePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: cat, lojas, isLoading } = useCatalogo();
  const { data: sacola } = useSacola();
  const loja = lojas.get(id);
  const [filtro, setFiltro] = useState("");
  const [ativa, setAtiva] = useState<string | null>(null);

  const itens = useMemo(() => cat?.itens.filter((i) => i.loja === id && (!filtro || `${i.nome} ${i.descricao}`.toLowerCase().includes(filtro.toLowerCase()))) ?? [], [cat, id, filtro]);
  const secoes = ORDEM_TIPOS.map((t) => ({ tipo: t, itens: itens.filter((i) => i.tipo === t) })).filter((s) => s.itens.length);
  const naSacola = sacola?.plano?.lojas.find((l) => l.id === id);

  useEffect(() => { // aba ativa acompanha a rolagem
    const obs = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setAtiva(v.target.id); },
      { rootMargin: "-140px 0px -60% 0px" });
    secoes.forEach((s) => { const el = document.getElementById(s.tipo); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [secoes.map((s) => s.tipo).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <div className="mx-auto max-w-[900px] space-y-4"><Skeleton className="h-44" /><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (!loja || !cat) return <p className="mx-auto max-w-[900px] text-ink-2">Loja não encontrada. <Link className="underline" to="/">Voltar</Link></p>;
  const indisponivel = !loja.aberta || !loja.na_area;

  return (
    <div className="mx-auto max-w-[900px]">
      <CapaLoja loja={loja} className="-mx-4 h-40 sm:mx-0 sm:h-48 sm:rounded-[var(--radius-panel)]">
        <button onClick={() => navigate(-1)} aria-label="Voltar" className="absolute top-3 left-3 grid size-10 place-items-center rounded-full bg-surface/95 text-ink shadow-md"><ArrowLeft className="size-5" /></button>
      </CapaLoja>
      <div className="relative -mt-12 rounded-[var(--radius-panel)] bg-surface p-5 shadow-[var(--shadow-flutuante)] ring-1 ring-line sm:mx-6">
        <div className="flex items-start gap-4">
          <StoreMark nome={loja.nome} cor={loja.cor} size="lg" className="-mt-12 !rounded-full ring-4 ring-surface" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] leading-tight">{loja.nome}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[14px] text-ink-2">
              <Star className="size-4 fill-oferta text-oferta" /><span className="tnum font-semibold text-ink">{loja.nota?.toLocaleString("pt-BR")}</span>
              <span aria-hidden>·</span>{loja.categoria}<span aria-hidden>·</span><span className="tnum">{km(loja.distancia_km)}</span>
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-[14px] bg-sunken/70 py-3 text-center">
          <div><dt className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Entrega</dt><dd className="tnum mt-0.5 flex items-center justify-center gap-1 font-semibold"><Clock className="size-3.5" />{loja.prazo}–{loja.prazo_max} min</dd></div>
          <div><dt className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Taxa</dt><dd className="tnum mt-0.5 font-semibold">{reais(loja.taxa)}</dd></div>
          <div><dt className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Mínimo</dt><dd className="tnum mt-0.5 font-semibold">{reais(loja.minimo)}</dd></div>
        </dl>
        {loja.cupons.length > 0 && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-oferta/40 px-3 py-1 text-[13px] font-semibold"><Ticket className="size-3.5" />Cupom {loja.cupons[0]} disponível</p>}
        {naSacola && naSacola.abaixo_do_minimo && (
          <p className="mt-3 text-[13px] text-warn">Faltam {reais(naSacola.minimo - naSacola.subtotal)} para o pedido mínimo desta loja.</p>
        )}
        {indisponivel && (
          <p className="mt-3 flex gap-2 rounded-[12px] bg-warn-wash px-3 py-2.5 text-[13px] text-warn"><Info className="mt-0.5 size-4 shrink-0" />
            {!loja.aberta ? `Fechada agora. Abre às ${loja.abre_as}. Você pode ver o cardápio.` : `Fora da área de entrega do seu endereço (${km(cat.raio_entrega_km)}).`}
          </p>
        )}
      </div>

      <div className="sticky top-16 z-20 -mx-4 mt-6 border-b border-line bg-paper/95 px-4 pt-2 backdrop-blur sm:mx-0 sm:px-0">
        <label className="flex h-11 items-center gap-2 rounded-full bg-surface px-4 ring-1 ring-line focus-within:ring-2 focus-within:ring-marca-700/50">
          <Search className="size-4 text-ink-3" /><span className="sr-only">Buscar no cardápio</span>
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder={`Buscar em ${loja.nome}`} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3" />
        </label>
        <nav aria-label="Seções do cardápio" className="mt-2 flex gap-5 overflow-x-auto scrollbar-none">
          {secoes.map((s) => (
            <a key={s.tipo} href={`#${s.tipo}`} aria-current={ativa === s.tipo ? "true" : undefined}
              className={cn("shrink-0 border-b-[3px] pb-2 text-[14px] font-semibold transition-colors", ativa === s.tipo ? "border-marca text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
              {TIPOS[s.tipo]}
            </a>
          ))}
        </nav>
      </div>

      {secoes.map((s) => (
        <section key={s.tipo} id={s.tipo} className="scroll-mt-40 pt-7" aria-labelledby={`t-${s.tipo}`}>
          <h2 id={`t-${s.tipo}`} className="text-[20px]">{TIPOS[s.tipo]}</h2>
          <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
            {s.itens.map((i, idx) => <ItemCard key={i.id} item={i} indice={idx} />)}
          </ul>
        </section>
      ))}
      {!secoes.length && <p className="py-12 text-center text-ink-3">Nada no cardápio com “{filtro}”.</p>}
    </div>
  );
}

export function ItemCard({ item: i, indice = 0, mostrarLoja }: { item: Item; indice?: number; mostrarLoja?: boolean }) {
  const abrir = useAbrirProduto();
  const { ids, alternar } = useFavoritos();
  const { data: sacola } = useSacola();
  const { lojas } = useCatalogo();
  const qtd = sacola?.itens.filter((x) => x.id === i.id).reduce((a, x) => a + x.qtd, 0) ?? 0;
  const fav = ids.has(i.id);
  return (
    <motion.li initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(indice, 6) * 0.03 }} className="border-b border-line">
      <div className={cn("flex gap-4 py-4", !i.disponivel && "opacity-55")}>
        <button onClick={() => abrir(i)} className="min-w-0 flex-1 text-left" disabled={!i.disponivel}>
          <span className="flex flex-wrap items-center gap-2"><span className="text-[15.5px] font-semibold">{i.nome}</span>{i.vegetariano && <VegMark />}</span>
          <span className="mt-1 line-clamp-2 block text-[13px] leading-snug text-ink-3">{i.descricao}</span>
          {mostrarLoja && <span className="mt-1 block text-[12.5px] text-ink-2">{lojas.get(i.loja)?.nome}</span>}
          <span className="mt-2 flex items-center gap-2">
            <span className="tnum text-[15px] font-semibold">{reais(i.preco)}</span>
            {i.opcoes.length > 0 && <span className="text-[12px] text-ink-3">com opções</span>}
            {!i.disponivel && <span className="text-[12px] font-semibold text-warn">{i.esgotado ? "Esgotado" : "Indisponível"}</span>}
          </span>
        </button>
        <div className="relative shrink-0">
          <ItemArte item={i} className="size-[100px] rounded-[16px]" />
          {qtd > 0 && <span className="absolute -top-2 -left-2 grid size-6 place-items-center rounded-full bg-marca text-[12px] font-bold text-white">{qtd}</span>}
          {i.disponivel && (
            <button onClick={() => abrir(i)} aria-label={`Adicionar ${i.nome}`} className="absolute -right-1.5 -bottom-1.5 grid size-9 place-items-center rounded-full bg-accent text-on-accent shadow-md transition-transform active:scale-90">
              <Plus className="size-4" strokeWidth={2.6} />
            </button>
          )}
          <button onClick={() => alternar.mutate(i.id)} aria-pressed={fav} aria-label={fav ? `Tirar ${i.nome} dos favoritos` : `Favoritar ${i.nome}`}
            className={cn("absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-surface/90", fav ? "text-marca" : "text-ink-3")}>
            <Heart className={cn("size-3.5", fav && "fill-current")} />
          </button>
        </div>
      </div>
    </motion.li>
  );
}
