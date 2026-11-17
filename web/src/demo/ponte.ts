/**
 * Modo demonstração (build para o GitHub Pages): as chamadas a /api vão para o backend real rodando no navegador
 * (ver worker.ts). Ativado só quando o build é feito com VITE_DEMO=1.
 */
import { CONFIG_DEMO } from "./config";

type Resposta = { tipo: "res"; id: number; status: number; headers: [string, string][]; corpo: Uint8Array };

const BASE = import.meta.env.BASE_URL; // ex.: /sacola-multiloja/

function tela(): { etapa: (t: string) => void; erro: (t: string) => void; fechar: () => void } {
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:var(--demo-fundo,#f6f2ea);color:var(--demo-texto,#2a2320);font:15px/1.5 system-ui,sans-serif;padding:24px;text-align:center";
  el.innerHTML = `<div style="max-width:420px">
    <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.6;margin:0 0 10px">Demonstração online</p>
    <p style="font-size:20px;font-weight:600;margin:0 0 8px">${CONFIG_DEMO.nome}</p>
    <p data-etapa style="margin:0 0 18px;opacity:.75">Iniciando</p>
    <div style="height:3px;border-radius:3px;background:rgba(0,0,0,.08);overflow:hidden"><div style="height:100%;width:35%;background:currentColor;opacity:.55;animation:demo-barra 1.2s ease-in-out infinite"></div></div>
    <p style="margin:18px 0 0;font-size:12.5px;opacity:.6">O servidor Python do projeto roda dentro do seu navegador. Na primeira visita isso leva alguns segundos; depois fica em cache.</p>
  </div><style>@keyframes demo-barra{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}</style>`;
  document.body.appendChild(el);
  const etapa = el.querySelector("[data-etapa]") as HTMLElement;
  return {
    etapa: (t) => { etapa.textContent = t; },
    erro: (t) => { etapa.textContent = t; etapa.style.color = "#b42318"; },
    fechar: () => el.remove(),
  };
}

function faixa() {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:2147483000;max-width:calc(100vw - 24px);background:rgba(30,24,22,.88);color:#fff;font:12.5px/1.4 system-ui,sans-serif;padding:7px 12px 7px 14px;border-radius:999px;display:flex;gap:10px;align-items:center;box-shadow:0 4px 18px rgba(0,0,0,.18)";
  el.innerHTML = `<span>Demonstração: dados fictícios, IA desligada e tudo volta ao início ao recarregar.</span><a href="${CONFIG_DEMO.repo}" target="_blank" rel="noopener" style="color:#fff;font-weight:600;white-space:nowrap">Código</a><button aria-label="Fechar aviso" style="all:unset;cursor:pointer;opacity:.7;padding:0 2px">×</button>`;
  el.querySelector("button")!.addEventListener("click", () => el.remove());
  document.body.appendChild(el);
}

export async function iniciarDemo() {
  const ui = tela();
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const pendentes = new Map<number, (r: Resposta) => void>();
  let seq = 0;

  await new Promise<void>((resolve, reject) => {
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.tipo === "progresso") ui.etapa(m.etapa);
      else if (m.tipo === "pronto") resolve();
      else if (m.tipo === "falha") { ui.erro("Não foi possível iniciar a demonstração neste navegador."); console.error(m.erro); reject(new Error(m.erro)); }
      else if (m.tipo === "res") { pendentes.get(m.id)?.(m); pendentes.delete(m.id); }
    };
    worker.postMessage({ tipo: "iniciar", pacote: `${BASE}demo/backend.zip`, ...CONFIG_DEMO.servidor });
  });

  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const u = new URL(req.url);
    const prefixo = u.pathname.startsWith(`${BASE}api/`) ? BASE : u.pathname.startsWith("/api/") ? "/" : null;
    if (u.origin !== location.origin || prefixo === null) return original(input, init);
    const corpo = ["GET", "HEAD"].includes(req.method) ? null : new Uint8Array(await req.arrayBuffer());
    const cab: Record<string, string> = {};
    req.headers.forEach((v, k) => { cab[k] = v; });
    const id = ++seq;
    const r = await new Promise<Resposta>((resolve) => {
      pendentes.set(id, resolve);
      worker.postMessage({ tipo: "req", id, metodo: req.method, url: `/${u.pathname.slice(prefixo.length)}${u.search}`, cab, corpo },
        corpo ? { transfer: [corpo.buffer] } : undefined);
    });
    const semCorpo = r.status === 204 || r.status === 304 || req.method === "HEAD";
    return new Response(semCorpo ? null : (r.corpo as Uint8Array<ArrayBuffer>), { status: r.status, headers: r.headers });
  };

  // Links de download (<a href="/api/..." download>) não passam pelo fetch: baixa pela ponte e entrega o arquivo.
  document.addEventListener("click", async (ev) => {
    const a = (ev.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || !(u.pathname.startsWith(`${BASE}api/`) || u.pathname.startsWith("/api/"))) return;
    ev.preventDefault();
    const r = await window.fetch(u.href);
    if (!r.ok) { alert("Não foi possível gerar o arquivo nesta demonstração."); return; }
    const nome = /filename="?([^";]+)"?/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? u.pathname.split("/").pop() ?? "arquivo";
    const url = URL.createObjectURL(await r.blob());
    const link = Object.assign(document.createElement("a"), { href: url, download: decodeURIComponent(nome) });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, true);

  ui.fechar();
  faixa();
}
