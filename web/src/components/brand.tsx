import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/** Logotipo UMAMI: ícone do dragão + palavra. O ícone é a ilustração oficial, nunca redesenhada. */
export function Logo({ compacto, className }: { compacto?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img src={`${import.meta.env.BASE_URL}marca/mascote-256.webp`} alt="" width={32} height={32} className="size-8 rounded-[9px]" />
      {!compacto && <span className="font-display text-[23px] font-semibold tracking-[0.04em] text-marca">UMAMI</span>}
    </span>
  );
}

/** O mascote, só em momentos estratégicos (abertura, estados vazios, sucesso). */
export function Mascote({ tamanho = 96, vivo = true, className }: { tamanho?: number; vivo?: boolean; className?: string }) {
  return (
    <img src={tamanho > 140 ? `${import.meta.env.BASE_URL}marca/mascote-512.webp` : `${import.meta.env.BASE_URL}marca/mascote-256.webp`} alt="" width={tamanho} height={tamanho}
      className={cn("rounded-[22%] shadow-[var(--shadow-flutuante)]", vivo && "mascote-vivo", className)} style={{ width: tamanho, height: tamanho }} />
  );
}

/** Tela de abertura: uma vez por sessão, some assim que o catálogo carrega (mínimo 650 ms, máximo 1,6 s). */
export function Splash({ pronto }: { pronto: boolean }) {
  const [visivel, setVisivel] = useState(() => {
    try {
      if (sessionStorage.getItem("umami-splash")) return false;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
      return true;
    } catch { return false; }
  });
  const [minimo, setMinimo] = useState(false);
  useEffect(() => {
    if (!visivel) return;
    const a = setTimeout(() => setMinimo(true), 650);
    const b = setTimeout(() => setVisivel(false), 1600);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [visivel]);
  useEffect(() => {
    if (visivel && pronto && minimo) setVisivel(false);
  }, [visivel, pronto, minimo]);
  useEffect(() => {
    if (!visivel) try { sessionStorage.setItem("umami-splash", "1"); } catch { /* ignora */ }
  }, [visivel]);

  return (
    <AnimatePresence>
      {visivel && (
        <motion.div key="splash" role="status" aria-label="Carregando UMAMI"
          className="seigaiha fixed inset-0 z-[80] grid place-items-center bg-marca"
          initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
          <div className="flex flex-col items-center">
            <motion.img src={`${import.meta.env.BASE_URL}marca/mascote-512.webp`} alt="" width={148} height={148}
              className="size-[148px] rounded-[32px] shadow-[0_24px_60px_-20px_rgba(67,37,31,.55)]"
              initial={{ scale: 0.82, y: 10, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }} />
            <motion.p className="mt-6 font-display text-[38px] font-semibold tracking-[0.12em] text-[#fff3df]"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4 }}>
              UMAMI
            </motion.p>
            <motion.p className="mt-1 text-[14px] text-[#ffe6c4]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
              Sabor de várias lojas, numa sacola só
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
