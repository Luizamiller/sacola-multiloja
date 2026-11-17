import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, FlaskConical, LoaderCircle, MessageCircle, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Logo, Mascote } from "@/components/brand";
import { Button } from "@/components/ui/primitives";
import { api, ApiError, type Desafio } from "@/lib/api";
import { useEu } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type Modo = "entrar" | "cadastro";

export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: eu } = useEu();
  const voltar = params.get("voltar") || "/";
  const [modo, setModo] = useState<Modo>(params.get("modo") === "cadastro" ? "cadastro" : "entrar");
  const [desafio, setDesafio] = useState<Desafio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [desafioDesde, setDesafioDesde] = useState(0);

  useEffect(() => { if (eu?.usuario && !desafio) navigate(voltar, { replace: true }); }, [eu, desafio, navigate, voltar]);

  const executar = async (fn: () => Promise<unknown>) => {
    setErro(null);
    setCarregando(true);
    try {
      const r = (await fn()) as Desafio | { etapa: "concluido" };
      if (r.etapa === "concluido") {
        await qc.invalidateQueries();
        navigate(voltar, { replace: true });
      } else {
        setDesafio(r as Desafio);
        setDesafioDesde(Date.now() - 3000);
        qc.invalidateQueries({ queryKey: ["caixa"] });
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível concluir. Tente de novo.");
      if (e instanceof ApiError && (e.status === 404 || (e.status === 429 && desafio))) setDesafio(null);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-[1fr_1.05fr]">
      <aside className="seigaiha relative hidden flex-col justify-between overflow-hidden bg-marca p-12 text-[#fff3df] lg:flex">
        <Link to="/" className="inline-flex items-center gap-2 font-display text-[26px] font-semibold tracking-[0.06em]">
          <img src={`${import.meta.env.BASE_URL}marca/mascote-256.webp`} alt="" className="size-10 rounded-[11px]" />UMAMI
        </Link>
        <div>
          <Mascote tamanho={190} className="shadow-[0_30px_70px_-24px_rgba(67,37,31,.6)]" />
          <p className="mt-10 max-w-[440px] font-display text-[40px] leading-[1.08] font-semibold">Sabor de várias lojas, numa sacola só.</p>
          <p className="mt-4 max-w-[420px] text-[16px] text-[#ffe6c4]">Restaurantes, mercado e farmácia no mesmo pedido. Lojas perto uma da outra dividem a mesma entrega.</p>
        </div>
        <p className="text-[12px] text-[#ffd9b8]">Projeto de portfólio. Lojas e preços são fictícios.</p>
      </aside>

      <main className="flex flex-col px-5 pt-6 pb-10 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <Link to="/" className="lg:hidden" aria-label="UMAMI, início"><Logo /></Link>
          <Link to="/" className="text-[14px] font-semibold text-accent-ink hover:underline">Continuar sem entrar</Link>
        </div>
        <div className="mx-auto mt-10 w-full max-w-[420px] flex-1 lg:mt-24">
          {eu?.modo_teste && <AvisoTeste />}
          <AnimatePresence mode="wait">
            <motion.div key={desafio ? desafio.etapa : modo} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
              {!desafio ? (
                <Credenciais modo={modo} setModo={(m) => { setModo(m); setErro(null); }} carregando={carregando}
                  onEntrar={(i, s) => executar(() => api.entrar(i, s))}
                  onCadastrar={(b) => executar(() => api.cadastro(b))} />
              ) : desafio.etapa === "email_confirmacao" ? (
                <ConfirmarEmail d={desafio} carregando={carregando} onVoltar={() => setDesafio(null)}
                  onEnviar={(f) => executar(() => api.confirmarEmail(desafio.id, f))} />
              ) : (
                <CodigoEtapa d={desafio} carregando={carregando} onVoltar={() => setDesafio(null)}
                  onEnviar={(c) => executar(() => api.enviarCodigo(desafio.id, c))}
                  onReenviar={() => executar(() => api.reenviar(desafio.id))} />
              )}
            </motion.div>
          </AnimatePresence>
          {erro && <motion.p role="alert" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} transition={{ duration: 0.35 }}
            className="mt-4 rounded-[12px] bg-danger-wash px-4 py-3 text-[14px] text-danger">{erro}</motion.p>}
          <p className="mt-8 flex items-start gap-2 text-[12px] text-ink-3"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Senha protegida com Argon2. Códigos valem 10 minutos e bloqueiam após 5 tentativas erradas.</p>
        </div>
      </main>
      {eu?.modo_teste && <CaixaDeTestes desde={desafioDesde} />}
    </div>
  );
}

function AvisoTeste() {
  return (
    <p className="mb-6 flex items-start gap-2 rounded-[12px] border border-warn/30 bg-warn-wash px-3.5 py-2.5 text-[12.5px] text-warn">
      <FlaskConical className="mt-0.5 size-3.5 shrink-0" />
      <span><strong className="font-semibold">Ambiente de testes.</strong> Nenhum WhatsApp ou e-mail é enviado de verdade: os códigos aparecem na caixa de testes, no canto da tela.</span>
    </p>
  );
}

function Campo({ id, rotulo, children, dica }: { id: string; rotulo: string; children: ReactNode; dica?: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-semibold text-ink-2">{rotulo}</label>
      <div className="mt-1.5">{children}</div>
      {dica && <p className="mt-1 text-[12px] text-ink-3">{dica}</p>}
    </div>
  );
}

const entrada = "h-12 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 text-[15px] outline-none transition-colors placeholder:text-ink-3 focus:border-marca-700";

function Credenciais({ modo, setModo, onEntrar, onCadastrar, carregando }: {
  modo: Modo; setModo: (m: Modo) => void; carregando: boolean;
  onEntrar: (identificador: string, senha: string) => void;
  onCadastrar: (b: { nome: string; email: string; telefone: string; senha: string }) => void;
}) {
  const [f, setF] = useState({ identificador: "", senha: "", nome: "", email: "", telefone: "" });
  const [ver, setVer] = useState(false);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (modo === "entrar") onEntrar(f.identificador, f.senha);
    else onCadastrar({ nome: f.nome, email: f.email, telefone: f.telefone, senha: f.senha });
  };
  return (
    <>
      <h1 className="text-[30px] leading-tight">{modo === "entrar" ? "Que bom te ver de novo" : "Crie sua conta"}</h1>
      <p className="mt-1.5 text-[15px] text-ink-2">{modo === "entrar" ? "Entre com e-mail ou celular e senha." : "Leva um minuto. Confirmamos seu celular pelo WhatsApp."}</p>
      <div role="tablist" aria-label="Acesso" className="mt-6 grid grid-cols-2 rounded-full bg-sunken p-1">
        {(["entrar", "cadastro"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={modo === m} onClick={() => setModo(m)}
            className={cn("h-10 rounded-full text-[14px] font-semibold transition-colors", modo === m ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}>
            {m === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>
      <form onSubmit={enviar} className="mt-6 space-y-4">
        {modo === "cadastro" ? (
          <>
            <Campo id="nome" rotulo="Nome"><input id="nome" required autoComplete="name" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} className={entrada} placeholder="Ana Souza" /></Campo>
            <Campo id="email" rotulo="E-mail"><input id="email" type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={entrada} placeholder="ana@exemplo.com" /></Campo>
            <Campo id="telefone" rotulo="Celular com WhatsApp"><input id="telefone" type="tel" inputMode="tel" required autoComplete="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} className={entrada} placeholder="(11) 91234-5678" /></Campo>
          </>
        ) : (
          <Campo id="identificador" rotulo="E-mail ou celular">
            <input id="identificador" required autoComplete="username" value={f.identificador} onChange={(e) => setF({ ...f, identificador: e.target.value })} className={entrada} placeholder="ana@exemplo.com ou (11) 91234-5678" />
          </Campo>
        )}
        <Campo id="senha" rotulo="Senha" dica={modo === "cadastro" ? "Pelo menos 8 caracteres." : undefined}>
          <div className="relative">
            <input id="senha" type={ver ? "text" : "password"} required minLength={modo === "cadastro" ? 8 : 1}
              autoComplete={modo === "entrar" ? "current-password" : "new-password"} value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} className={cn(entrada, "pr-12")} />
            <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? "Esconder senha" : "Mostrar senha"} className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-3 hover:text-ink">
              {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Campo>
        <Button type="submit" variant="accent" size="lg" className="w-full rounded-full" disabled={carregando}>
          {carregando && <LoaderCircle className="size-4 animate-spin" />}{modo === "entrar" ? "Continuar" : "Criar conta"}
        </Button>
      </form>
      {modo === "entrar" && (
        <p className="mt-5 rounded-[12px] bg-surface px-4 py-3 text-[13px] text-ink-2 ring-1 ring-line">
          Conta de demonstração: <span className="font-semibold text-ink">demo@umami.app</span> · senha <span className="font-semibold text-ink">umami-demo-2026</span>
        </p>
      )}
    </>
  );
}

function OTP({ onCompleto, desabilitado }: { onCompleto: (codigo: string) => void; desabilitado?: boolean }) {
  const [d, setD] = useState<string[]>(Array(6).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { refs.current[0]?.focus(); }, []);
  useEffect(() => {
    const preencher = (e: Event) => {
      const c = (e as CustomEvent<string>).detail;
      setD(c.split(""));
      onCompleto(c);
    };
    window.addEventListener("umami-codigo-teste", preencher);
    return () => window.removeEventListener("umami-codigo-teste", preencher);
  }, [onCompleto]);
  const definir = (i: number, v: string) => {
    const digitos = v.replace(/\D/g, "");
    if (digitos.length > 1) { // colagem ou preenchimento automático
      const novo = digitos.slice(0, 6).split("");
      while (novo.length < 6) novo.push("");
      setD(novo);
      refs.current[Math.min(5, digitos.length)]?.focus();
      if (digitos.length >= 6) onCompleto(digitos.slice(0, 6));
      return;
    }
    const novo = [...d];
    novo[i] = digitos;
    setD(novo);
    if (digitos && i < 5) refs.current[i + 1]?.focus();
    if (novo.every(Boolean)) onCompleto(novo.join(""));
  };
  return (
    <div className="flex justify-between gap-2" role="group" aria-label="Código de 6 dígitos">
      {d.map((v, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} value={v} disabled={desabilitado}
          inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={i === 0 ? 6 : 1} aria-label={`Dígito ${i + 1}`}
          onChange={(e) => definir(i, e.target.value)}
          onKeyDown={(e) => { if (e.key === "Backspace" && !v && i > 0) refs.current[i - 1]?.focus(); if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus(); if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus(); }}
          onFocus={(e) => e.target.select()}
          className={cn("h-14 w-full min-w-0 rounded-[14px] border-2 bg-surface text-center font-display text-[24px] font-semibold outline-none transition-colors",
            v ? "border-accent" : "border-line-strong", "focus:border-marca-700")} />
      ))}
    </div>
  );
}

function useContagem(segundos: number) {
  const [s, setS] = useState(segundos);
  useEffect(() => { setS(segundos); }, [segundos]);
  useEffect(() => {
    if (s <= 0) return;
    const t = setTimeout(() => setS(s - 1), 1000);
    return () => clearTimeout(t);
  }, [s]);
  return s;
}

function CodigoEtapa({ d, onEnviar, onReenviar, onVoltar, carregando }: {
  d: Desafio; onEnviar: (c: string) => void; onReenviar: () => void; onVoltar: () => void; carregando: boolean;
}) {
  const espera = useContagem(d.reenvio_em_s);
  const whatsapp = d.etapa === "whatsapp";
  return (
    <>
      <button onClick={onVoltar} className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /> Voltar</button>
      <span className="grid size-12 place-items-center rounded-full bg-ok-wash text-ok"><MessageCircle className="size-6" /></span>
      <h1 className="mt-4 text-[28px] leading-tight">{whatsapp ? "Confira seu WhatsApp" : "Confira seu e-mail"}</h1>
      <p className="mt-1.5 text-[15px] text-ink-2">
        Enviamos um código de 6 dígitos para <span className="font-semibold text-ink">{whatsapp ? d.telefone : d.email_mascarado}</span>.
        {!whatsapp && " Como houve uma tentativa com erro, confirmamos também pelo e-mail."}
      </p>
      <div className="mt-7"><OTP onCompleto={onEnviar} desabilitado={carregando} /></div>
      <div className="mt-5 flex items-center justify-between text-[13px]">
        <span className="text-ink-3">{d.tentativas_restantes} tentativas restantes</span>
        {espera > 0 ? <span className="tnum text-ink-3">Reenviar em 0:{String(espera).padStart(2, "0")}</span>
          : d.reenvios_restantes > 0 ? <button onClick={onReenviar} className="font-semibold text-accent-ink hover:underline">Reenviar código</button>
            : <span className="text-ink-3">Limite de reenvios atingido</span>}
      </div>
      {carregando && <p className="mt-4 flex items-center gap-2 text-[13px] text-ink-2"><LoaderCircle className="size-4 animate-spin" /> Conferindo…</p>}
    </>
  );
}

function ConfirmarEmail({ d, onEnviar, onVoltar, carregando }: { d: Desafio; onEnviar: (f: string) => void; onVoltar: () => void; carregando: boolean }) {
  const [v, setV] = useState("");
  const e = d.email!;
  return (
    <>
      <button onClick={onVoltar} className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink"><ArrowLeft className="size-4" /> Voltar</button>
      <h1 className="text-[28px] leading-tight">Confirme seu e-mail</h1>
      <p className="mt-1.5 text-[15px] text-ink-2">Complete as letras que faltam no e-mail da sua conta.</p>
      <form onSubmit={(ev) => { ev.preventDefault(); if (v.trim()) onEnviar(v.trim()); }} className="mt-7">
        <label htmlFor="faltantes" className="sr-only">Letras que faltam no e-mail</label>
        <div className="flex items-center gap-1 rounded-[var(--radius-control)] border-2 border-line-strong bg-surface px-4 py-3 font-display text-[18px] focus-within:border-marca-700">
          <span className="shrink-0 font-semibold">{e.inicio}</span>
          <input id="faltantes" autoFocus value={v} onChange={(x) => setV(x.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false}
            placeholder={"•".repeat(e.faltam)} size={Math.max(4, e.faltam)} className="min-w-0 flex-1 border-b-2 border-dashed border-accent bg-transparent text-center outline-none placeholder:text-ink-3" />
          <span className="truncate font-semibold">{e.fim}</span>
        </div>
        <p className="mt-2 text-[12px] text-ink-3">{e.faltam} {e.faltam === 1 ? "caractere" : "caracteres"} · isso protege sua conta se alguém tiver acesso ao seu celular</p>
        <Button type="submit" variant="accent" size="lg" className="mt-6 w-full rounded-full" disabled={carregando || !v.trim()}>
          {carregando && <LoaderCircle className="size-4 animate-spin" />}Confirmar e entrar
        </Button>
      </form>
    </>
  );
}

/** Caixa de testes: mostra o que TERIA sido enviado. Só existe com AUTH_MODO=teste. */
function CaixaDeTestes({ desde }: { desde: number }) {
  const [aberta, setAberta] = useState(true);
  const { data } = useQuery({ queryKey: ["caixa"], queryFn: api.caixaDeTestes, refetchInterval: 1500 });
  const ultimo = data?.find((m) => new Date(m.criado_em).getTime() >= desde);
  const codigo = ultimo?.texto.match(/\b\d{6}\b/)?.[0];
  return (
    <div className="fixed right-4 bottom-4 z-50 w-[300px] max-w-[calc(100vw-2rem)]">
      <button onClick={() => setAberta(!aberta)} className="ml-auto flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-paper shadow-[var(--shadow-flutuante)]">
        <FlaskConical className="size-3.5" /> Caixa de testes{data?.length ? ` · ${data.length}` : ""}
      </button>
      <AnimatePresence>
        {aberta && ultimo && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="mt-2 rounded-[16px] bg-surface p-4 shadow-[var(--shadow-flutuante)] ring-1 ring-line">
            <p className="text-[11px] font-semibold tracking-wide text-warn uppercase">Simulado · não enviado</p>
            <p className="mt-1 text-[12px] text-ink-3">{ultimo.canal === "whatsapp" ? "WhatsApp" : "E-mail"} para {ultimo.destino}</p>
            <p className="mt-2 text-[13.5px]">{ultimo.texto}</p>
            {codigo && (
              <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => window.dispatchEvent(new CustomEvent("umami-codigo-teste", { detail: codigo }))}>
                Usar código {codigo}
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
