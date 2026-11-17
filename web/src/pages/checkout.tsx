import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Banknote, CreditCard, QrCode } from "lucide-react";
import { RadioGroup } from "radix-ui";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";

import { Total } from "@/components/bag";
import { StoreMark } from "@/components/store-mark";
import { useToast } from "@/components/toast";
import { Button, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useCatalogo, useEu, useSacola } from "@/lib/hooks";
import { Mascote } from "@/components/brand";
import { useQuery } from "@tanstack/react-query";
import { cn, reais } from "@/lib/utils";

const PAGAMENTOS = [
  { id: "pix", rotulo: "Pix", detalhe: "Aprovação imediata", icone: QrCode },
  { id: "cartao", rotulo: "Cartão salvo", detalhe: "Crédito · simulado", icone: CreditCard },
  { id: "dinheiro", rotulo: "Dinheiro na entrega", detalhe: "Uma cobrança por entrega", icone: Banknote },
];

export function CheckoutPage() {
  const { data: sacola, isLoading } = useSacola();
  const { data: cat, lojas } = useCatalogo();
  const [pagamento, setPagamento] = useState("pix");
  const [concluido, setConcluido] = useState(false);
  const { data: eu } = useEu();
  const { data: enderecos } = useQuery({ queryKey: ["enderecos", eu?.usuario?.id ?? 0], queryFn: api.enderecos, enabled: !!eu?.usuario });
  const [enderecoId, setEnderecoId] = useState<number | null>(null);
  const endSel = enderecos?.find((e) => e.id === enderecoId) ?? enderecos?.find((e) => e.padrao) ?? enderecos?.[0];
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const finalizar = useMutation({
    mutationFn: () => api.finalizar(pagamento, endSel?.id),
    onSuccess: async (p) => {
      setConcluido(true);
      qc.setQueryData(["pedido", p.id], p);
      await navigate(`/pedidos/${p.id}`, { replace: true, state: { novo: true } });
      qc.invalidateQueries({ queryKey: ["sacola"] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
    },
    onError: (e) => toast((e as Error).message, "erro"),
  });

  if (isLoading) return <Skeleton className="mx-auto h-96 max-w-[960px]" />;
  if (!sacola?.plano) return concluido ? <Skeleton className="mx-auto h-96 max-w-[960px]" /> : <Navigate to="/" replace />;
  const p = sacola.plano;
  if (eu && !eu.usuario) {
    return (
      <div className="mx-auto flex max-w-[460px] flex-col items-center py-16 text-center">
        <Mascote tamanho={96} />
        <h1 className="mt-6 text-[26px]">Entre para finalizar</h1>
        <p className="mt-2 text-ink-2">Sua sacola fica guardada. Depois de entrar, você volta direto para cá.</p>
        <Link to="/entrar?voltar=/checkout" className="mt-6 w-full"><Button variant="accent" size="lg" className="w-full rounded-full">Entrar ou criar conta</Button></Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[960px]">
      <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" /> Continuar comprando</Link>
      <h1 className="mt-4 text-[32px] font-semibold">Revisar pedido</h1>
      <p className="text-[14px] text-ink-2">Um pagamento. Cada loja recebe só a parte dela; se uma recusar, só essa parte é estornada.</p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-8">
          <section aria-labelledby="entrega-h">
            <div className="flex items-center justify-between"><h2 id="entrega-h" className="text-lg font-semibold">Entrega em</h2>
              <Link to="/perfil/enderecos" className="text-[13px] font-semibold text-accent-ink hover:underline">Gerenciar</Link></div>
            <RadioGroup.Root value={String(endSel?.id ?? "")} onValueChange={(v) => setEnderecoId(Number(v))} className="mt-3 grid gap-2" aria-label="Endereço de entrega">
              {(enderecos ?? []).map((e) => (
                <RadioGroup.Item key={e.id} value={String(e.id)}
                  className={cn("flex items-start gap-3 rounded-[14px] border px-4 py-3 text-left transition-colors", endSel?.id === e.id ? "border-marca-700 bg-surface" : "border-line hover:border-line-strong")}>
                  <span className={cn("mt-1 grid size-4 shrink-0 place-items-center rounded-full border-2", endSel?.id === e.id ? "border-marca-700" : "border-line-strong")}>
                    {endSel?.id === e.id && <span className="size-1.5 rounded-full bg-marca-700" />}
                  </span>
                  <span><span className="block text-[14px] font-semibold">{e.apelido}</span><span className="text-[13px] text-ink-2">{e.linha}{e.complemento && ` · ${e.complemento}`}</span></span>
                </RadioGroup.Item>
              ))}
              {!enderecos?.length && <p className="text-[14px] text-ink-2">{cat?.endereco}</p>}
            </RadioGroup.Root>
          </section>

          <section aria-labelledby="pacotes-h">
            <h2 id="pacotes-h" className="text-lg font-semibold">{p.entregas.length === 1 ? "1 entrega" : `${p.entregas.length} entregas`}</h2>
            <ol className="mt-3 space-y-4">
              {p.entregas.map((e, idx) => (
                <li key={idx} className="rounded-[var(--radius-panel)] border border-line bg-surface">
                  <div className="flex items-center justify-between border-b border-line px-5 py-3 text-[13px]">
                    <span className="font-medium">{e.combinada ? "Entrega combinada" : "Entrega própria"}</span>
                    <span className="tnum text-ink-2">até {e.prazo} min · {reais(e.taxa)}</span>
                  </div>
                  {e.lojas.map((id) => {
                    const loja = lojas.get(id)!;
                    const itens = sacola.itens.filter((i) => i.loja === id);
                    return (
                      <div key={id} className="flex gap-3 px-5 py-4">
                        <StoreMark nome={loja.nome} cor={loja.cor} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-medium">{loja.nome}</p>
                          <ul className="mt-1 space-y-0.5 text-[13px] text-ink-2">
                            {itens.map((i) => (
                              <li key={i.id} className="flex justify-between gap-4">
                                <span>{i.qtd}× {i.nome}{!!i.detalhes?.length && <span className="block text-[12px] text-ink-3">{i.detalhes.join(" · ")}</span>}</span><span className="tnum">{reais((i.preco_unitario ?? i.preco) * i.qtd)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="pag-h">
            <h2 id="pag-h" className="text-lg font-semibold">Pagamento</h2>
            <p className="text-[13px] text-ink-3">Ambiente de demonstração: nenhuma cobrança real é feita.</p>
            <RadioGroup.Root value={pagamento} onValueChange={setPagamento} className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Forma de pagamento">
              {PAGAMENTOS.map((m) => (
                <RadioGroup.Item key={m.id} value={m.id}
                  className={cn("flex items-start gap-3 rounded-[12px] border px-4 py-3 text-left transition-colors",
                    pagamento === m.id ? "border-ink bg-surface" : "border-line hover:border-line-strong")}>
                  <m.icone className="mt-0.5 size-4 text-ink-2" />
                  <span><span className="block text-[14px] font-medium">{m.rotulo}</span><span className="text-[12px] text-ink-3">{m.detalhe}</span></span>
                </RadioGroup.Item>
              ))}
            </RadioGroup.Root>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-5">
            <dl className="space-y-1.5 text-[14px]">
              <div className="flex justify-between text-ink-2"><dt>Itens</dt><dd className="tnum">{reais(p.total_itens)}</dd></div>
              <div className="flex justify-between text-ink-2"><dt>Entrega</dt><dd className="tnum">{reais(p.total_taxas)}</dd></div>
              {p.economia > 0 && <div className="flex justify-between text-ok"><dt>Economia combinada</dt><dd className="tnum">− {reais(p.economia)}</dd></div>}
              {!!p.desconto && <div className="flex justify-between text-ok"><dt>Cupom {sacola.cupom?.codigo}</dt><dd className="tnum">− {reais(p.desconto)}</dd></div>}
              <div className="flex items-baseline justify-between border-t border-line pt-3">
                <dt className="font-medium">Total</dt><dd><Total valor={p.total_final ?? p.total} className="font-display text-[26px] font-semibold" /></dd>
              </div>
              <p className="text-right text-[12px] text-ink-3">chega em até {p.prazo} min</p>
            </dl>
            {p.problemas.length > 0 && (
              <ul className="mt-3 rounded-[10px] bg-warn-wash px-3 py-2 text-[12px] text-warn">{p.problemas.map((x) => <li key={x.mensagem}>{x.mensagem}</li>)}</ul>
            )}
            <Button variant="accent" size="lg" className="mt-4 w-full" disabled={!p.pode_finalizar || finalizar.isPending} onClick={() => finalizar.mutate()}>
              {finalizar.isPending ? "Enviando às lojas" : `Fazer pedido · ${reais(p.total_final ?? p.total)}`}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
