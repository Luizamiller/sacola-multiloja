import { Check, CircleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Tom = "ok" | "erro";
type T = { id: number; texto: string; tom: Tom };
const Ctx = createContext<(texto: string, tom?: Tom) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<T[]>([]);
  const mostrar = useCallback((texto: string, tom: Tom = "ok") => {
    const id = Date.now() + Math.random();
    setItens((v) => [...v.slice(-2), { id, texto, tom }]);
    setTimeout(() => setItens((v) => v.filter((t) => t.id !== id)), 3600);
  }, []);
  return (
    <Ctx.Provider value={mostrar}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 lg:bottom-6">
        <AnimatePresence>
          {itens.map((t) => (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-[12px] bg-ink px-4 py-2.5 text-sm text-paper shadow-lg">
              {t.tom === "ok" ? <Check className="size-4 text-[#f0a37a]" /> : <CircleAlert className="size-4 text-[#f2877d]" />}
              {t.texto}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
