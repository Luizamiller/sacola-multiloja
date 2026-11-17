import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import { useToast } from "@/components/toast";
import { Button, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useCatalogo, useFavoritos } from "@/lib/hooks";
import { reais } from "@/lib/utils";
import { ItemCard } from "./store";

export function FavoritesPage() {
  const { data: favs, isLoading } = useFavoritos();
  const { data: listas } = useQuery({ queryKey: ["listas"], queryFn: api.listas });
  const { lojas } = useCatalogo();
  const qc = useQueryClient();
  const toast = useToast();
  const aplicar = useMutation({
    mutationFn: api.aplicarLista,
    onSuccess: (s) => { qc.setQueryData(["sacola"], s); toast("Lista adicionada à sacola"); },
    onError: (e) => toast((e as Error).message, "erro"),
  });
  const apagar = useMutation({
    mutationFn: api.apagarLista,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["listas"] }),
  });

  return (
    <div className="mx-auto max-w-[860px] space-y-12">
      <section aria-labelledby="listas-h">
        <h1 id="listas-h" className="text-[32px] font-semibold">Listas salvas</h1>
        <p className="text-[14px] text-ink-2">Pedidos que se repetem, de várias lojas, num toque. Salve a sacola atual pelo painel da sacola.</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {listas?.map((l) => (
            <li key={l.id} className="flex flex-col rounded-[var(--radius-panel)] border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-semibold">{l.nome}</p>
                  <p className="text-[13px] text-ink-3">{l.lojas} {l.lojas === 1 ? "loja" : "lojas"} · {reais(l.total)} com entrega</p>
                </div>
                <button onClick={() => apagar.mutate(l.id)} aria-label={`Apagar lista ${l.nome}`} className="text-ink-3 hover:text-danger">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <ul className="mt-3 flex-1 space-y-0.5 text-[13px] text-ink-2">
                {l.itens.map((i) => <li key={i.id}>{i.qtd}× {i.nome} <span className="text-ink-3">· {lojas.get(i.loja)?.nome}</span></li>)}
              </ul>
              {l.problemas.length > 0 && <p className="mt-2 text-[12px] text-warn">{l.problemas[0]}</p>}
              <Button variant="primary" className="mt-4" onClick={() => aplicar.mutate(l.id)} disabled={aplicar.isPending}>Adicionar à sacola</Button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pratos-h">
        <h2 id="pratos-h" className="text-2xl font-semibold">Pratos favoritos</h2>
        <p className="text-[14px] text-ink-2">Favoritos de pratos, não só de restaurantes.</p>
        {isLoading && <Skeleton className="mt-4 h-24" />}
        {favs && !favs.length && <p className="mt-6 border-y border-line py-8 text-center text-[13px] text-ink-3">Toque no coração ao lado de um prato para guardá-lo aqui.</p>}
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {favs?.map((i, idx) => <ItemCard key={i.id} item={i} indice={idx} mostrarLoja />)}
        </ul>
      </section>
    </div>
  );
}
