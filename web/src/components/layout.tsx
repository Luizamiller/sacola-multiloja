import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Home, MapPin, Moon, Receipt, Search, ShoppingBag, Sun, TextCursorInput, User } from "lucide-react";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { BagPanel, Total } from "@/components/bag";
import { Logo, Splash } from "@/components/brand";
import { useAssistente } from "@/components/assistant";
import { Button, Sheet } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useCatalogo, useEu, useSacola, useTema } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", rotulo: "Início", icone: Home },
  { to: "/busca", rotulo: "Busca", icone: Search },
  { to: "/pedidos", rotulo: "Pedidos", icone: Receipt },
  { to: "/perfil", rotulo: "Perfil", icone: User },
];

export function useEndereco() {
  const { data: eu } = useEu();
  const { data: cat } = useCatalogo();
  const { data: ends } = useQuery({ queryKey: ["enderecos", eu?.usuario?.id ?? 0], queryFn: api.enderecos });
  const padrao = ends?.find((e) => e.padrao) ?? ends?.[0];
  return padrao ? padrao.linha : cat?.endereco;
}

export function Layout() {
  const { data: cat } = useCatalogo();
  const { data: sacola } = useSacola();
  const { data: eu } = useEu();
  const { abrir } = useAssistente();
  const [escuro, setEscuro] = useTema();
  const [bagAberta, setBagAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const endereco = useEndereco();
  const qtd = sacola?.itens.reduce((a, i) => a + i.qtd, 0) ?? 0;
  const semRail = /^\/(checkout|sacola)/.test(pathname);
  const pulo = useAnimationControls();

  useEffect(() => {
    const f = () => pulo.start({ scale: [1, 1.18, 0.96, 1], transition: { duration: 0.45 } });
    window.addEventListener("umami-sacola-pulo", f);
    return () => window.removeEventListener("umami-sacola-pulo", f);
  }, [pulo]);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="min-h-dvh">
      <Splash pronto={!!cat} />
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">Pular para o conteúdo</a>

      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur-[6px]">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
          <NavLink to="/" aria-label="UMAMI, início" className="hidden sm:block"><Logo /></NavLink>
          <NavLink to="/" aria-label="UMAMI, início" className="sm:hidden"><Logo compacto /></NavLink>
          <Link to="/perfil/enderecos" className="flex min-w-0 flex-col leading-tight sm:ml-2">
            <span className="text-[11px] font-semibold tracking-wide text-ink-3 uppercase">Entregar em</span>
            <span className="flex items-center gap-1 text-[14px] font-semibold"><MapPin className="size-3.5 shrink-0 text-marca-700" /><span className="truncate">{endereco ?? "…"}</span><ChevronDown className="size-3.5 shrink-0 text-ink-3" /></span>
          </Link>
          <form onSubmit={(e) => { e.preventDefault(); navigate(`/busca${busca.trim() ? `?q=${encodeURIComponent(busca.trim())}` : ""}`); }}
            className="ml-auto hidden h-11 w-full max-w-[420px] items-center gap-2 rounded-full bg-surface px-4 ring-1 ring-line focus-within:ring-2 focus-within:ring-marca-700/60 lg:flex">
            <Search className="size-4 text-ink-3" />
            <label htmlFor="busca-topo" className="sr-only">Buscar lojas e pratos</label>
            <input id="busca-topo" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Busque por item ou loja" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3" />
          </form>
          <div className="ml-auto flex items-center gap-1.5 lg:ml-2">
            <Button variant="ghost" size="sm" onClick={() => abrir()} className="hidden md:inline-flex"><TextCursorInput className="size-4" /> Assistente</Button>
            <Button variant="ghost" size="icon" onClick={() => setEscuro(!escuro)} aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"}>
              {escuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            {eu?.usuario ? (
              <Link to="/perfil" className="hidden items-center gap-2 rounded-full py-1 pr-3 pl-1 hover:bg-sunken md:flex">
                <span className="grid size-8 place-items-center rounded-full bg-marca font-display text-[14px] font-semibold text-white">{eu.usuario.primeiro_nome[0]}</span>
                <span className="text-[14px] font-semibold">{eu.usuario.primeiro_nome}</span>
              </Link>
            ) : (
              <Link to={`/entrar?voltar=${encodeURIComponent(pathname)}`} className="hidden md:block"><Button variant="outline" size="sm" className="rounded-full">Entrar</Button></Link>
            )}
            <motion.div animate={pulo}>
              <Button variant="primary" size="sm" className="rounded-full xl:hidden" onClick={() => (window.innerWidth < 640 ? navigate("/sacola") : setBagAberta(true))} aria-label={`Abrir sacola, ${qtd} itens`}>
                <ShoppingBag className="size-4" /><span className="tnum">{qtd}</span>
                {sacola?.plano && <Total valor={sacola.plano.total_final ?? sacola.plano.total} className="hidden sm:inline" />}
              </Button>
            </motion.div>
          </div>
        </div>
      </header>

      <div className={cn("mx-auto max-w-[1440px]", !semRail && "xl:grid xl:grid-cols-[minmax(0,1fr)_400px]")}>
        <main id="conteudo" className="min-w-0 px-4 pb-40 pt-5 sm:px-6 lg:pb-16">
          <AnimatePresence mode="wait">
            <motion.div key={pathname.split("/").slice(0, 2).join("/")} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
        {!semRail && (
          <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] border-l border-line bg-surface xl:block" aria-label="Sua sacola">
            <div className="flex h-full flex-col">
              <motion.h2 animate={pulo} className="border-b border-line px-5 py-4 text-lg">Sua sacola</motion.h2>
              <div className="min-h-0 flex-1"><BagPanel /></div>
            </div>
          </aside>
        )}
      </div>

      <Sheet open={bagAberta} onOpenChange={setBagAberta} title="Sua sacola" width="w-[440px]">
        <BagPanel variante="sheet" onNavigate={() => setBagAberta(false)} />
      </Sheet>

      {/* barra da sacola, no celular, acima da navegação */}
      <AnimatePresence>
        {qtd > 0 && !semRail && sacola?.plano && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 lg:hidden">
            <Link to="/sacola" className="flex items-center gap-3 rounded-[16px] bg-accent px-4 py-3 text-on-accent shadow-[var(--shadow-flutuante)]">
              <motion.span animate={pulo} className="grid size-9 place-items-center rounded-full bg-[#43251f] text-[#fff3df]"><ShoppingBag className="size-4" /></motion.span>
              <span className="flex-1 leading-tight">
                <span className="block text-[13px] font-semibold">Ver sacola</span>
                <span className="block text-[12px]">{qtd} {qtd === 1 ? "item" : "itens"} · {sacola.plano.lojas.length} {sacola.plano.lojas.length === 1 ? "loja" : "lojas"}</span>
              </span>
              <Total valor={sacola.plano.total_final ?? sacola.plano.total} className="font-display text-[17px] font-semibold" />
              <ChevronRight className="size-4" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) =>
            cn("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors", isActive ? "text-marca-700" : "text-ink-3")}>
            {({ isActive }) => (<><n.icone className="size-[22px]" strokeWidth={isActive ? 2.2 : 1.7} />{n.rotulo}</>)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
