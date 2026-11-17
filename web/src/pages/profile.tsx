import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Heart, LogOut, MapPin, Monitor, Plus, Receipt, Star, Ticket, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { BagPanel } from "@/components/bag";
import { Mascote } from "@/components/brand";
import { useToast } from "@/components/toast";
import { Button, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useEu } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export function ProfilePage() {
  const { data: eu, isLoading } = useEu();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sair = useMutation({ mutationFn: api.sair, onSuccess: async () => { await qc.invalidateQueries(); navigate("/"); } });
  if (isLoading) return <Skeleton className="mx-auto h-80 max-w-[720px]" />;
  const u = eu?.usuario;

  return (
    <div className="mx-auto max-w-[720px]">
      {u ? (
        <div className="flex items-center gap-4">
          <span className="grid size-16 place-items-center rounded-full bg-marca font-display text-[26px] font-semibold text-white">{u.primeiro_nome[0]}</span>
          <div className="min-w-0">
            <h1 className="text-[26px] leading-tight">Olá, {u.primeiro_nome}</h1>
            <p className="truncate text-[14px] text-ink-2">{u.email} · {u.telefone}</p>
          </div>
        </div>
      ) : (
        <div className="borda-onda flex items-center gap-4 rounded-[var(--radius-panel)] bg-surface px-5 pt-7 pb-5 ring-1 ring-line">
          <Mascote tamanho={72} />
          <div className="flex-1">
            <p className="font-display text-[20px] font-semibold">Entre na sua conta</p>
            <p className="text-[14px] text-ink-2">Para pedir, acompanhar entregas e guardar endereços.</p>
          </div>
          <Link to="/entrar?voltar=/perfil"><Button variant="accent" className="rounded-full">Entrar</Button></Link>
        </div>
      )}

      <ul className="mt-8 divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] bg-surface ring-1 ring-line">
        {[
          { to: "/pedidos", icone: Receipt, rotulo: "Pedidos", sub: "Acompanhe e peça de novo" },
          { to: "/perfil/enderecos", icone: MapPin, rotulo: "Endereços", sub: "Casa, trabalho e outros" },
          { to: "/favoritos", icone: Heart, rotulo: "Favoritos e listas", sub: "Pratos e pedidos que se repetem" },
          { to: "/perfil/cupons", icone: Ticket, rotulo: "Cupons", sub: "Descontos disponíveis" },
          ...(u ? [{ to: "/perfil/seguranca", icone: Monitor, rotulo: "Segurança", sub: "Sessões e dispositivos conectados" }] : []),
        ].map((x) => (
          <li key={x.to}>
            <Link to={x.to} className="flex items-center gap-4 px-5 py-4 hover:bg-sunken/60">
              <span className="grid size-10 place-items-center rounded-full bg-sunken text-marca-700"><x.icone className="size-5" /></span>
              <span className="flex-1"><span className="block font-semibold">{x.rotulo}</span><span className="block text-[13px] text-ink-3">{x.sub}</span></span>
              <ChevronRight className="size-4 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
      {u && (
        <Button variant="ghost" className="mt-6 text-danger" onClick={() => sair.mutate()} disabled={sair.isPending}><LogOut className="size-4" /> Sair da conta</Button>
      )}
      <p className="mt-10 flex items-center gap-1.5 text-[12px] text-ink-3"><Star className="size-3" /> UMAMI · projeto de portfólio · lojas, preços e entregas são fictícios</p>
    </div>
  );
}

function Voltar({ titulo }: { titulo: string }) {
  return (
    <div className="flex items-center gap-2">
      <Link to="/perfil" aria-label="Voltar" className="grid size-10 place-items-center rounded-full hover:bg-sunken"><ArrowLeft className="size-5" /></Link>
      <h1 className="text-[26px]">{titulo}</h1>
    </div>
  );
}

export function AddressesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: eu } = useEu();
  const chave = ["enderecos", eu?.usuario?.id ?? 0];
  const { data, isLoading } = useQuery({ queryKey: chave, queryFn: api.enderecos });
  const set = (d: unknown) => qc.setQueryData(chave, d);
  const onError = (e: Error) => toast(e.message, "erro");
  const padrao = useMutation({ mutationFn: api.enderecoPadrao, onSuccess: set, onError });
  const apagar = useMutation({ mutationFn: api.apagarEndereco, onSuccess: set, onError });
  const criar = useMutation({ mutationFn: api.criarEndereco, onSuccess: (d) => { set(d); setNovo(false); setF({ apelido: "", linha: "", complemento: "" }); toast("Endereço salvo"); }, onError });
  const [novo, setNovo] = useState(false);
  const [f, setF] = useState({ apelido: "", linha: "", complemento: "" });
  const entrada = "h-11 w-full rounded-[12px] border border-line-strong bg-paper px-3 text-[14px] outline-none focus:border-marca-700";

  return (
    <div className="mx-auto max-w-[720px]">
      <Voltar titulo="Endereços" />
      <p className="mt-1 text-[13px] text-ink-3">Nesta demonstração, a distância até as lojas usa uma posição fixa do bairro; o endereço escolhido vai no pedido.</p>
      {isLoading && <Skeleton className="mt-6 h-32" />}
      <ul className="mt-6 space-y-2">
        {data?.map((e) => (
          <li key={e.id} className={cn("flex items-center gap-3 rounded-[16px] bg-surface px-4 py-3.5 ring-1", e.padrao ? "ring-2 ring-marca-700" : "ring-line")}>
            <MapPin className={cn("size-5 shrink-0", e.padrao ? "text-marca-700" : "text-ink-3")} />
            <button onClick={() => padrao.mutate(e.id)} className="min-w-0 flex-1 text-left">
              <span className="flex items-center gap-2 font-semibold">{e.apelido}{e.padrao && <span className="rounded-full bg-marca-700 px-2 py-0.5 text-[10px] font-bold text-white uppercase">padrão</span>}</span>
              <span className="block truncate text-[13px] text-ink-2">{e.linha}{e.complemento && ` · ${e.complemento}`}</span>
            </button>
            <button onClick={() => apagar.mutate(e.id)} aria-label={`Apagar ${e.apelido}`} className="text-ink-3 hover:text-danger"><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
      {novo ? (
        <form className="mt-4 space-y-3 rounded-[16px] bg-surface p-4 ring-1 ring-line" onSubmit={(e) => { e.preventDefault(); criar.mutate({ ...f, padrao: true }); }}>
          <input aria-label="Apelido" required placeholder="Apelido (ex.: Trabalho)" value={f.apelido} onChange={(e) => setF({ ...f, apelido: e.target.value })} className={entrada} />
          <input aria-label="Endereço" required minLength={5} placeholder="Rua, número · bairro" value={f.linha} onChange={(e) => setF({ ...f, linha: e.target.value })} className={entrada} autoComplete="street-address" />
          <input aria-label="Complemento" placeholder="Complemento (opcional)" value={f.complemento} onChange={(e) => setF({ ...f, complemento: e.target.value })} className={entrada} />
          <div className="flex gap-2"><Button type="submit" variant="accent" className="rounded-full" disabled={criar.isPending}>Salvar e usar</Button><Button type="button" variant="ghost" onClick={() => setNovo(false)}>Cancelar</Button></div>
        </form>
      ) : (
        <Button variant="outline" className="mt-4 rounded-full" onClick={() => setNovo(true)}><Plus className="size-4" /> Novo endereço</Button>
      )}
    </div>
  );
}

export function SecurityPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["sessoes"], queryFn: api.sessoes, retry: false });
  const encerrar = useMutation({ mutationFn: api.encerrarSessao, onSuccess: () => qc.invalidateQueries({ queryKey: ["sessoes"] }) });
  return (
    <div className="mx-auto max-w-[720px]">
      <Voltar titulo="Segurança" />
      <p className="mt-1 text-[14px] text-ink-2">Aparelhos com sessão ativa na sua conta. Encerre os que você não reconhece.</p>
      {error && <p className="mt-6 text-ink-2">Entre na conta para ver suas sessões.</p>}
      {isLoading && <Skeleton className="mt-6 h-24" />}
      <ul className="mt-6 divide-y divide-line rounded-[16px] bg-surface ring-1 ring-line">
        {data?.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3.5">
            <Monitor className="size-5 text-ink-3" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{/Mobile|Android|iPhone/.test(s.dispositivo) ? "Celular" : "Computador"} · {s.dispositivo.match(/(Edg|Chrome|Firefox|Safari)\/[\d.]+/)?.[0]?.split("/")[0]?.replace("Edg", "Edge") ?? "Navegador"}</p>
              <p className="text-[12.5px] text-ink-3">Último acesso {new Date(s.visto_em).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            {s.atual ? <span className="text-[12px] font-semibold text-ok">este aparelho</span>
              : <Button size="sm" variant="outline" onClick={() => encerrar.mutate(s.id)}>Encerrar</Button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CouponsPage() {
  const { data } = useQuery({ queryKey: ["cupons"], queryFn: api.cupons, staleTime: Infinity });
  const qc = useQueryClient();
  const toast = useToast();
  const aplicar = useMutation({ mutationFn: api.cupom, onSuccess: (s) => { qc.setQueryData(["sacola"], s); toast(s.cupom?.valido ? `Cupom ${s.cupom.codigo} aplicado` : `Guardado na sacola: ${s.cupom?.motivo}`); } });
  return (
    <div className="mx-auto max-w-[720px]">
      <Voltar titulo="Cupons" />
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {data?.map((c) => (
          <li key={c.codigo} className="borda-onda rounded-[16px] bg-surface px-4 pt-5 pb-4 ring-1 ring-line">
            <p className="font-display text-[19px] font-semibold tracking-wide">{c.codigo}</p>
            <p className="mt-0.5 text-[14px] text-ink-2">{c.descricao}</p>
            <p className="mt-1 text-[12px] text-ink-3">{c.loja_nome ? `Só na ${c.loja_nome}` : "Em qualquer loja"}</p>
            <Button size="sm" variant="accent" className="mt-3 rounded-full" onClick={() => aplicar.mutate(c.codigo)}>Aplicar na sacola</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BagPage() {
  return (
    <div className="mx-auto max-w-[640px]">
      <div className="flex items-center gap-2">
        <Link to="/" aria-label="Voltar" className="grid size-10 place-items-center rounded-full hover:bg-sunken"><ArrowLeft className="size-5" /></Link>
        <h1 className="text-[26px]">Sua sacola</h1>
      </div>
      <div className="mt-4 overflow-hidden rounded-[var(--radius-panel)] bg-surface ring-1 ring-line"><BagPanel variante="sheet" /></div>
    </div>
  );
}
