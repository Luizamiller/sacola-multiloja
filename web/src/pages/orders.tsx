import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bike, ChevronRight, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { Link, useLocation, useNavigate, useParams } from "react-router";

import { Mascote } from "@/components/brand";

import { StoreMark } from "@/components/store-mark";
import { useToast } from "@/components/toast";
import { Button, Skeleton } from "@/components/ui/primitives";
import { api, type Pedido } from "@/lib/api";
import { useCatalogo } from "@/lib/hooks";
import { cn, reais } from "@/lib/utils";

const data = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function PedirDeNovo({ id, compacto }: { id: number; compacto?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: () => api.repetir(id),
    onSuccess: (s) => {
      qc.setQueryData(["sacola"], s);
      toast(s.indisponiveis.length ? `Sacola refeita. Indisponível agora: ${s.indisponiveis.join(", ")}` : "Itens de volta na sacola");
      navigate(window.innerWidth < 640 ? "/sacola" : "/checkout");
    },
    onError: (e) => toast((e as Error).message, "erro"),
  });
  return (
    <Button size={compacto ? "sm" : "md"} variant="outline" className="rounded-full" onClick={(e) => { e.preventDefault(); m.mutate(); }} disabled={m.isPending}>
      <RotateCcw className="size-3.5" /> Pedir de novo
    </Button>
  );
}

export function OrdersPage() {
  const { data: pedidos, isLoading } = useQuery({ queryKey: ["pedidos"], queryFn: api.pedidos });
  return (
    <div className="mx-auto max-w-[860px]">
      <h1 className="text-[32px] font-semibold">Pedidos</h1>
      {isLoading && <div className="mt-6 space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
      {pedidos && !pedidos.length && (
        <div className="mt-10 border-y border-line py-12 text-center">
          <p className="font-display text-lg">Nenhum pedido ainda</p>
          <p className="mt-1 text-[13px] text-ink-3">Seus pedidos multi-loja aparecem aqui, com o andamento de cada loja.</p>
          <Link to="/" className="mt-3 inline-block text-[13px] font-medium text-accent-ink hover:underline">Ver lojas</Link>
        </div>
      )}
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {pedidos?.map((p) => (
          <li key={p.id}>
            <Link to={`/pedidos/${p.id}`} className="group flex items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">Pedido #{p.id} · {p.lojas.map((l) => l.loja_nome).join(", ")}</p>
                <p className="text-[13px] text-ink-3">{data(p.criado_em)} · {p.lojas.length} lojas · {p.origem === "assistente" ? "montado pelo assistente" : "montado por você"}</p>
              </div>
              <span className="tnum text-[14px]">{reais(p.total_cobrado)}</span>
              <span className="hidden sm:block"><PedirDeNovo id={p.id} compacto /></span>
              <ChevronRight className="size-4 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OrderPage() {
  const { id } = useParams();
  const pid = Number(id);
  const novo = !!(useLocation().state as { novo?: boolean } | null)?.novo;
  const qc = useQueryClient();
  const toast = useToast();
  const { lojas } = useCatalogo();
  const { data: p, isLoading } = useQuery({
    queryKey: ["pedido", pid], queryFn: () => api.pedido(pid),
    refetchInterval: (q) => (q.state.data?.lojas.every((l) => l.recusado || l.etapa.codigo === "entregue") ? false : 2000),
  });
  const recusar = useMutation({
    mutationFn: (loja: string) => api.recusar(pid, loja),
    onSuccess: (d) => { qc.setQueryData(["pedido", pid], d); toast("Recusa simulada: só a parte dessa loja foi estornada"); },
    onError: (e) => toast((e as Error).message, "erro"),
  });

  if (isLoading || !p) return <Skeleton className="mx-auto h-96 max-w-[860px]" />;

  return (
    <div className="mx-auto max-w-[860px]">
      {novo && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="borda-onda mb-8 flex items-center gap-5 rounded-[var(--radius-panel)] bg-surface px-5 pt-7 pb-5 ring-1 ring-line">
          <Mascote tamanho={76} />
          <div>
            <p className="font-display text-[22px] font-semibold">Pedido enviado às lojas</p>
            <p className="text-[14px] text-ink-2">{p.lojas.length === 1 ? "A loja já recebeu" : `As ${p.lojas.length} lojas já receberam`} a sua parte. Acompanhe cada uma abaixo.</p>
          </div>
        </motion.div>
      )}
      <Link to="/pedidos" className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" /> Pedidos</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-semibold">Pedido #{p.id}</h1>
          <p className="text-[14px] text-ink-2">{data(p.criado_em)} · {p.endereco}</p>
        </div>
        <div className="text-right">
          <p className="tnum font-display text-[26px] font-semibold">{reais(p.total_cobrado)}</p>
          {p.desconto > 0 && <p className="tnum text-[12px] text-ok">cupom {p.cupom}: − {reais(p.desconto)}</p>}
          {p.estornado > 0 && <p className="tnum text-[12px] text-ok">{reais(p.estornado)} estornado de {reais(p.total)}</p>}
          <div className="mt-2"><PedirDeNovo id={p.id} compacto /></div>
        </div>
      </div>
      <p className="mt-2 text-[12px] text-ink-3">Acompanhamento simulado e acelerado: cada minuto de prazo leva 2 segundos.</p>

      <ol className="mt-8 space-y-4">
        {p.lojas.map((l) => {
          const loja = lojas.get(l.loja_id);
          return (
            <li key={l.loja_id} className="rounded-[var(--radius-panel)] border border-line bg-surface p-5">
              <div className="flex items-center gap-3">
                {loja && <StoreMark nome={loja.nome} cor={loja.cor} size="sm" />}
                <p className="flex-1 text-[15px] font-medium">{l.loja_nome}</p>
                <span className={cn("text-[13px]", l.recusado ? "text-danger" : l.etapa.codigo === "entregue" ? "text-ok" : "text-ink-2")}>
                  {l.etapa.rotulo}
                </span>
              </div>
              {!l.recusado && <Linha p={p} progresso={l.etapa.progresso} />}
              {l.entregador && !l.recusado && (
                <p className="mt-3 flex items-center gap-2 rounded-[12px] bg-sunken px-3 py-2 text-[13px]">
                  <Bike className="size-4 text-marca-700" />
                  <span><span className="font-semibold">{l.entregador.nome}</span> · {l.entregador.veiculo.toLowerCase()} · {l.etapa.codigo === "entregue" ? "entregou" : "a caminho"}</span>
                  <span className="ml-auto text-[11px] text-ink-3">entregador simulado</span>
                </p>
              )}
              <ul className="mt-4 space-y-0.5 text-[13px] text-ink-2">
                {l.itens.map((i, k) => (
                  <li key={i.item_id + k} className="flex justify-between gap-4">
                    <span>{i.qtd}× {i.nome}{!!i.detalhes?.length && <span className="block text-[12px] text-ink-3">{i.detalhes.join(" · ")}</span>}
                      {i.observacao && <span className="block text-[12px] text-ink-3 italic">“{i.observacao}”</span>}</span>
                    <span className="tnum">{reais(i.preco * i.qtd)}</span>
                  </li>
                ))}
              </ul>
              {l.recusado ? (
                <p className="mt-3 rounded-[10px] bg-danger-wash px-3 py-2 text-[12px] text-danger">
                  {l.motivo_recusa} Estorno de {reais(l.valor_estorno)} (itens + diferença na entrega).
                </p>
              ) : l.etapa.codigo !== "entregue" && (
                <div className="mt-3 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => recusar.mutate(l.loja_id)} disabled={recusar.isPending}>
                    Simular recusa desta loja
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Linha({ p, progresso }: { p: Pedido; progresso: number }) {
  return (
    <div className="mt-4">
      <div className="relative h-1 rounded-full bg-sunken">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-accent" initial={false} animate={{ width: `${progresso * 100}%` }}
          transition={{ duration: 0.8, ease: "linear" }} />
      </div>
      <ol className="mt-2 grid grid-cols-4 text-[11px] text-ink-3">
        {p.etapas.map((e, i) => (
          <li key={e.codigo} className={cn(i === 0 ? "text-left" : i === 3 ? "text-right" : "text-center",
            progresso >= [0, 0.1, 0.6, 1][i] && "text-ink")}>{e.rotulo}</li>
        ))}
      </ol>
    </div>
  );
}
