import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, Clock, Map, Plus, Search, Star, Ticket, TextCursorInput } from "lucide-react";
import { motion } from "motion/react";
import { Popover } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import { CapaLoja, ICONES, ItemArte } from "@/components/art";
import { useAssistente } from "@/components/assistant";
import { NeighborhoodMap } from "@/components/neighborhood-map";
import { useAbrirProduto } from "@/components/product-sheet";
import { StoreMark } from "@/components/store-mark";
import { useToast } from "@/components/toast";
import { Button, Sheet, Skeleton } from "@/components/ui/primitives";
import { api, type Catalogo, type Loja } from "@/lib/api";
import { useCatalogo, useSacola } from "@/lib/hooks";
import { cn, km, reais } from "@/lib/utils";

const POPULARES = ["b1", "m1", "n1", "a1", "h2", "f1", "m4", "b3"];
type Ordem = "relevancia" | "distancia" | "nota" | "tempo" | "taxa";
const ORDENS: [Ordem, string][] = [["relevancia", "Relevância"], ["distancia", "Distância"], ["nota", "Avaliação"], ["tempo", "Tempo de entrega"], ["taxa", "Taxa de entrega"]];

export function HomePage() {
  const { data: cat, isLoading, lojas: indice } = useCatalogo();
  const { data: sacola } = useSacola();
  const [ordem, setOrdem] = useState<Ordem>("relevancia");
  const [filtros, setFiltros] = useState({ combinada: false, aberto: false, nota: false, minimo: false });
  const [mapa, setMapa] = useState(false);
  const naSacola = useMemo(() => new Set(sacola?.plano?.lojas.map((l) => l.id)), [sacola]);

  const combina = (l: Loja) => !naSacola.has(l.id) && [...naSacola].some((id) => {
    const o = indice.get(id);
    return o && Math.hypot(o.x - l.x, o.y - l.y) <= 2;
  });
  const lista = useMemo(() => {
    if (!cat) return [];
    const r = cat.lojas.filter((l) => (!filtros.aberto || (l.aberta && l.na_area)) && (!filtros.nota || (l.nota ?? 0) >= 4.7)
      && (!filtros.minimo || l.minimo <= 20) && (!filtros.combinada || combina(l)));
    const disp = (l: Loja) => (l.aberta && l.na_area ? 0 : 1);
    const chave: Record<Ordem, (l: Loja) => number> = { relevancia: () => 0, distancia: (l) => l.distancia_km, nota: (l) => -(l.nota ?? 0), tempo: (l) => l.prazo, taxa: (l) => l.taxa };
    return [...r].sort((a, b) => disp(a) - disp(b) || chave[ordem](a) - chave[ordem](b));
  }, [cat, filtros, ordem, naSacola]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-[1040px] space-y-9">
      <Link to="/busca" className="flex h-12 items-center gap-3 rounded-full bg-surface px-4 text-[14px] text-ink-3 ring-1 ring-line lg:hidden">
        <Search className="size-4" /> Busque por item ou loja
      </Link>

      {cat ? <Categorias cat={cat} /> : <Skeleton className="h-24" />}
      <FaixaCupons />
      <Banners />

      <section aria-labelledby="famosas">
        <h2 id="famosas" className="text-[22px]">Lojas por perto</h2>
        <ul className="-mx-4 mt-3 flex gap-4 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
          {cat?.lojas.filter((l) => l.na_area).map((l) => (
            <li key={l.id} className="shrink-0">
              <Link to={`/loja/${l.id}`} className="group flex w-[76px] flex-col items-center gap-1.5 text-center">
                <span className="rounded-full p-0.5 ring-2 ring-transparent transition group-hover:ring-accent"><StoreMark nome={l.nome} cor={l.cor} className="!size-16 !rounded-full !text-[16px]" /></span>
                <span className="line-clamp-2 text-[12px] leading-tight text-ink-2">{l.nome}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Populares />

      <section aria-labelledby="lojas" id="lojas">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[22px]">Todas as lojas</h2>
          <button onClick={() => setMapa(true)} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-accent-ink hover:underline"><Map className="size-4" /> Ver no mapa</button>
        </div>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0" role="group" aria-label="Filtros">
          <Popover.Root>
            <Popover.Trigger className={cn("inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-[13px] font-semibold ring-1", ordem !== "relevancia" ? "bg-ink text-paper ring-ink" : "bg-surface ring-line")}>
              {ordem === "relevancia" ? "Ordenar" : ORDENS.find((o) => o[0] === ordem)![1]} <ChevronDown className="size-3.5" />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="start" sideOffset={6} className="z-50 w-56 rounded-[16px] bg-surface p-1.5 shadow-[var(--shadow-flutuante)] ring-1 ring-line">
                {ORDENS.map(([id, r]) => (
                  <Popover.Close key={id} asChild>
                    <button onClick={() => setOrdem(id)} className="flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-[14px] hover:bg-sunken">
                      {r}{ordem === id && <Check className="size-4 text-marca-700" />}
                    </button>
                  </Popover.Close>
                ))}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          {([["combinada", "Entrega combinada"], ["aberto", "Aberto agora"], ["nota", "Nota 4,7+"], ["minimo", "Pedido mínimo até R$ 20"]] as const).map(([k, r]) => (
            <button key={k} onClick={() => setFiltros((f) => ({ ...f, [k]: !f[k] }))} aria-pressed={filtros[k]}
              className={cn("h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold ring-1 transition-colors", filtros[k] ? "bg-ink text-paper ring-ink" : "bg-surface ring-line hover:ring-line-strong")}>
              {r}
            </button>
          ))}
        </div>
        {filtros.combinada && !naSacola.size && <p className="mt-3 text-[13px] text-ink-3">Adicione um item à sacola para ver as lojas que dividem a entrega com ela.</p>}
        <ul className="mt-4 grid gap-x-6 sm:grid-cols-2">
          {isLoading && Array.from({ length: 6 }).map((_, i) => <li key={i} className="py-3"><Skeleton className="h-20" /></li>)}
          {lista.map((l, i) => <LojaCard key={l.id} loja={l} i={i} combinada={combina(l)} naSacola={naSacola.has(l.id)} />)}
        </ul>
        {cat && !lista.length && <p className="py-10 text-center text-ink-3">Nenhuma loja com esses filtros.</p>}
      </section>

      <Sheet open={mapa} onOpenChange={setMapa} title="Lojas no mapa" description="Lojas a até 2 km entre si saem na mesma entrega." width="w-[560px]">
        <div className="p-5">{cat && <NeighborhoodMap catalogo={cat} plano={sacola?.plano} />}</div>
      </Sheet>
    </div>
  );
}

function Categorias({ cat }: { cat: Catalogo }) {
  return (
    <section aria-label="Categorias">
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-10 sm:px-0">
        {cat.categorias.map((c, i) => {
          const Icone = ICONES[c.icone];
          return (
            <motion.li key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="shrink-0">
              <Link to={`/busca?categoria=${c.id}`} className="group flex w-[76px] flex-col items-center gap-1.5 sm:w-auto">
                <span className="grid aspect-square w-full place-items-center rounded-[18px] text-[#43251f] transition-transform group-hover:-translate-y-0.5 group-active:scale-95" style={{ background: c.cor }}>
                  {Icone && <Icone className="size-8" strokeWidth={1.6} />}
                </span>
                <span className="text-[12.5px] font-semibold">{c.nome}</span>
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}

function FaixaCupons() {
  const [aberto, setAberto] = useState(false);
  const { data: cupons } = useQuery({ queryKey: ["cupons"], queryFn: api.cupons, staleTime: Infinity });
  const qc = useQueryClient();
  const toast = useToast();
  const aplicar = useMutation({
    mutationFn: api.cupom,
    onSuccess: (s) => { qc.setQueryData(["sacola"], s); toast(s.cupom?.valido ? `Cupom ${s.cupom.codigo} aplicado` : `Cupom guardado: ${s.cupom?.motivo ?? ""}`); setAberto(false); },
    onError: (e) => toast((e as Error).message, "erro"),
  });
  return (
    <>
      <button onClick={() => setAberto(true)} className="borda-onda flex w-full items-center gap-3 rounded-[16px] bg-oferta/30 px-4 pt-4 pb-3 text-left ring-1 ring-oferta/60">
        <span className="grid size-10 place-items-center rounded-full bg-oferta text-[#43251f]"><Ticket className="size-5" /></span>
        <span className="flex-1">
          <span className="block font-display text-[16px] font-semibold">Você tem {cupons?.length ?? "…"} cupons</span>
          <span className="block text-[13px] text-ink-2">Toque para ver e aplicar na sacola</span>
        </span>
        <ArrowRight className="size-4" />
      </button>
      <Sheet open={aberto} onOpenChange={setAberto} title="Seus cupons" description="Um cupom por pedido. Cupom de loja vale sobre o subtotal dela.">
        <ul className="space-y-3 p-5">
          {cupons?.map((c) => (
            <li key={c.codigo} className="borda-onda rounded-[16px] bg-surface px-4 pt-5 pb-4 ring-1 ring-line">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-[18px] font-semibold tracking-wide">{c.codigo}</p>
                  <p className="mt-0.5 text-[14px] text-ink-2">{c.descricao}</p>
                  <p className="mt-1 text-[12px] text-ink-3">{c.loja_nome ? `Só na ${c.loja_nome}` : "Em qualquer loja"}</p>
                </div>
                <Button size="sm" variant="accent" className="rounded-full" onClick={() => aplicar.mutate(c.codigo)}>Aplicar</Button>
              </div>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

function Banners() {
  const { abrir } = useAssistente();
  const qc = useQueryClient();
  const toast = useToast();
  const trilho = useRef<HTMLDivElement>(null);
  const [ativo, setAtivo] = useState(0);
  const banners = [
    { titulo: "Diga o que quer comer. A gente monta a sacola.", texto: "Ex.: jantar para 3 com sobremesa, até R$ 130", acao: "Montar com o assistente", fn: () => abrir(), cor: "bg-marca" },
    { titulo: "R$ 10 na primeira compra", texto: "Cupom BEMVINDO em pedidos a partir de R$ 50", acao: "Aplicar cupom", fn: async () => { const s = await api.cupom("BEMVINDO"); qc.setQueryData(["sacola"], s); toast("Cupom BEMVINDO aplicado"); }, cor: "bg-[#c8321f]" },
    { titulo: "Lojas vizinhas, uma entrega só", texto: "Até 4 lojas na sacola. Perto uma da outra, pagam a maior taxa + R$ 1,99.", acao: "Ver lojas", fn: () => document.getElementById("lojas")?.scrollIntoView({ behavior: "smooth" }), cor: "bg-[#43251f]" },
  ];
  useEffect(() => {
    const t = setInterval(() => {
      if (!trilho.current || document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const prox = (ativo + 1) % banners.length;
      trilho.current.scrollTo({ left: prox * trilho.current.clientWidth, behavior: "smooth" });
    }, 6000);
    return () => clearInterval(t);
  }, [ativo, banners.length]);
  return (
    <section aria-roledescription="carrossel" aria-label="Destaques">
      <div ref={trilho} onScroll={(e) => setAtivo(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-[var(--radius-panel)] scrollbar-none">
        {banners.map((b, i) => (
          <div key={i} className={cn("seigaiha relative w-full shrink-0 snap-center px-6 py-7 text-[#fff3df] sm:px-9 sm:py-9", b.cor)} aria-roledescription="slide" aria-label={`${i + 1} de ${banners.length}`}>
            <p className="max-w-[520px] font-display text-[26px] leading-[1.1] font-semibold sm:text-[34px]">{b.titulo}</p>
            <p className="mt-2 max-w-[480px] text-[14px] text-[#ffe6c4]">{b.texto}</p>
            <Button variant="accent" className="mt-5 rounded-full" onClick={b.fn}>{i === 0 && <TextCursorInput className="size-4" />}{b.acao}</Button>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex justify-center gap-1.5">
        {banners.map((_, i) => (
          <button key={i} aria-label={`Ir para o destaque ${i + 1}`} aria-current={ativo === i}
            onClick={() => trilho.current?.scrollTo({ left: i * trilho.current.clientWidth, behavior: "smooth" })}
            className={cn("h-1.5 rounded-full transition-all", ativo === i ? "w-6 bg-marca" : "w-1.5 bg-line-strong")} />
        ))}
      </div>
    </section>
  );
}

function Populares() {
  const { itens, lojas } = useCatalogo();
  const abrirProduto = useAbrirProduto();
  const lista = POPULARES.map((id) => itens.get(id)).filter((i): i is NonNullable<typeof i> => !!i && i.disponivel);
  return (
    <section aria-labelledby="populares">
      <h2 id="populares" className="text-[22px]">Os mais pedidos</h2>
      <ul className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:px-0">
        {lista.map((i) => (
          <li key={i.id} className="w-[172px] shrink-0">
            <button onClick={() => abrirProduto(i)} className="group block w-full overflow-hidden rounded-[18px] bg-surface text-left ring-1 ring-line transition-shadow hover:shadow-[var(--shadow-flutuante)]">
              <div className="relative overflow-hidden">
                <ItemArte item={i} className="h-[112px] w-full transition-transform duration-300 group-hover:scale-[1.04]" />
                <span className="absolute right-2 bottom-2 grid size-9 place-items-center rounded-full bg-accent text-on-accent shadow-md transition-transform group-active:scale-90"><Plus className="size-4" strokeWidth={2.6} /></span>
              </div>
              <div className="p-3">
                <p className="line-clamp-1 text-[14px] font-semibold">{i.nome}</p>
                <p className="line-clamp-1 text-[12px] text-ink-3">{lojas.get(i.loja)?.nome}</p>
                <p className="tnum mt-1 text-[14px] font-semibold">{reais(i.preco)}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LojaCard({ loja: l, i = 0, combinada, naSacola }: { loja: Loja; i?: number; combinada?: boolean; naSacola?: boolean }) {
  const indisponivel = !l.aberta || !l.na_area;
  return (
    <motion.li initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.025 }} className="border-b border-line">
      <Link to={`/loja/${l.id}`} className="group flex items-center gap-4 py-4">
        <CapaLoja loja={l} className={cn("grid size-[72px] shrink-0 place-items-center rounded-[18px] transition-transform group-hover:scale-[1.03]", indisponivel && "opacity-45 grayscale")}>
          <span className="font-display text-[22px] font-semibold text-white">{l.nome.replace(/&/g, "").split(/\s+/).filter((p) => p.length > 2).slice(0, 2).map((p) => p[0]).join("")}</span>
        </CapaLoja>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[16px] font-semibold", indisponivel && "text-ink-3")}>{l.nome}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-2">
            <Star className="size-3.5 fill-oferta text-oferta" /><span className="tnum font-semibold text-ink">{l.nota?.toLocaleString("pt-BR")}</span>
            <span aria-hidden>·</span>{l.categoria}<span aria-hidden>·</span><span className="tnum">{km(l.distancia_km)}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-2">
            {!l.aberta ? <span className="font-semibold text-warn">Fechada · abre às {l.abre_as}</span>
              : !l.na_area ? <span className="text-ink-3">Fora da sua área de entrega</span>
                : <><Clock className="size-3.5" /><span className="tnum">{l.prazo}–{l.prazo_max} min</span><span aria-hidden>·</span><span className="tnum">{reais(l.taxa)}</span></>}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {naSacola && <span className="rounded-full bg-oferta px-2 py-0.5 text-[11px] font-bold text-[#43251f]">na sacola</span>}
            {combinada && <span className="rounded-full bg-ok-wash px-2 py-0.5 text-[11px] font-bold text-ok">entrega combinada</span>}
            {l.cupons.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-accent-wash px-2 py-0.5 text-[11px] font-bold text-accent-ink"><Ticket className="size-3" />cupom {l.cupons[0]}</span>}
          </div>
        </div>
      </Link>
    </motion.li>
  );
}
