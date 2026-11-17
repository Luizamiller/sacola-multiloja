import { motion } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router";

import type { Catalogo, Plano } from "@/lib/api";
import { cn, km } from "@/lib/utils";

/**
 * Mapa esquemático do bairro (coordenadas em km do catálogo).
 * Mostra o cliente, as lojas e — quando há sacola — quais lojas dividem a mesma entrega.
 */
export function NeighborhoodMap({ catalogo, plano, className }: { catalogo: Catalogo; plano?: Plano | null; className?: string }) {
  const navigate = useNavigate();
  const [foco, setFoco] = useState<string | null>(null);
  const xs = catalogo.lojas.map((l) => l.x).concat(catalogo.cliente.x);
  const ys = catalogo.lojas.map((l) => l.y).concat(catalogo.cliente.y);
  const pad = 0.9;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const W = 440, esc = W / (maxX - minX), H = (maxY - minY) * esc;
  const px = (x: number) => (x - minX) * esc;
  const py = (y: number) => (maxY - y) * esc; // norte para cima

  const naSacola = new Set(plano?.lojas.map((l) => l.id));
  const grupos = plano?.entregas.filter((e) => e.combinada) ?? [];
  const pos = new Map(catalogo.lojas.map((l) => [l.id, l]));

  return (
    <figure className={cn("relative overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img"
        aria-label={`Mapa esquemático com ${catalogo.lojas.length} lojas ao redor do seu endereço`}>
        <defs>
          <pattern id="grade" width={esc} height={esc} patternUnits="userSpaceOnUse" x={px(Math.ceil(minX))} y={py(Math.floor(maxY))}>
            <path d={`M ${esc} 0 L 0 0 0 ${esc}`} fill="none" stroke="var(--line)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#grade)" />
        {/* área de entrega */}
        <circle cx={px(catalogo.cliente.x)} cy={py(catalogo.cliente.y)} r={catalogo.raio_entrega_km * esc}
          fill="var(--accent)" fillOpacity="0.035" stroke="var(--accent)" strokeOpacity="0.35" strokeDasharray="2 5" />
        {/* grupos de entrega combinada */}
        {grupos.map((g, i) =>
          g.lojas.slice(1).map((id, k) => {
            const a = pos.get(g.lojas[k])!, b = pos.get(id)!;
            return (
              <motion.line key={`${i}-${id}`} x1={px(a.x)} y1={py(a.y)} x2={px(b.x)} y2={py(b.y)} stroke="var(--accent)" strokeWidth="2"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
            );
          }),
        )}
        {catalogo.lojas.map((l) => {
          const ativa = naSacola.has(l.id);
          const indisponivel = !l.aberta || !l.na_area;
          return (
            <g key={l.id} transform={`translate(${px(l.x)} ${py(l.y)})`} className="cursor-pointer" tabIndex={0} role="link"
              aria-label={`${l.nome}, ${km(l.distancia_km)}${indisponivel ? ", indisponível" : ""}`}
              onMouseEnter={() => setFoco(l.id)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(l.id)} onBlur={() => setFoco(null)}
              onClick={() => navigate(`/loja/${l.id}`)} onKeyDown={(e) => e.key === "Enter" && navigate(`/loja/${l.id}`)}>
              {ativa && <circle r={2 * esc / 2} fill="none" stroke="var(--accent)" strokeOpacity=".25" strokeDasharray="3 4" />}
              <circle r={ativa ? 7 : 5} fill={indisponivel ? "var(--surface)" : ativa ? "var(--accent)" : l.cor}
                stroke={indisponivel ? "var(--ink-3)" : "var(--surface)"} strokeWidth="2" strokeDasharray={indisponivel ? "2 2" : undefined} />
              {(ativa || foco === l.id || naSacola.size === 0) && <text y={-14} textAnchor="middle" className="font-sans" fontSize="11" fontWeight={ativa || foco === l.id ? 600 : 450}
                fill={indisponivel ? "var(--ink-3)" : "var(--ink)"} opacity={ativa || foco === l.id ? 1 : 0.72}>
                {l.nome}
              </text>}
            </g>
          );
        })}
        <g transform={`translate(${px(catalogo.cliente.x)} ${py(catalogo.cliente.y)})`} aria-hidden>
          <circle r="11" fill="var(--ink)" fillOpacity=".1" />
          <circle r="5" fill="var(--ink)" stroke="var(--surface)" strokeWidth="2" />
        </g>
        <g transform={`translate(${W - esc - 18} ${H - 18})`} aria-hidden>
          <line x1="0" x2={esc} y1="0" y2="0" stroke="var(--ink-3)" strokeWidth="1.5" />
          <text x={esc / 2} y="-6" textAnchor="middle" fontSize="11" fill="var(--ink-3)">1 km</text>
        </g>
      </svg>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-ink" />Você</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />Na sacola</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-accent" />Mesma entrega</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full border border-dashed border-ink-3" />Fechada ou fora da área</span>
      </figcaption>
    </figure>
  );
}
