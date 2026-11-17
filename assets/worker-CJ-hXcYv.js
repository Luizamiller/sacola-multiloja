const e=`https://cdn.jsdelivr.net/pyodide/v314.0.8/full/`,t=String.raw`
import sys, os, json, asyncio, types
from contextlib import asynccontextmanager
from http.cookies import SimpleCookie

sys.path.insert(0, "/repo/backend")
os.chdir("/repo/backend")

# Sem threads no navegador: o que o FastAPI mandaria para o pool de threads roda direto.
import anyio.to_thread
async def _run_sync(func, *args, abandon_on_cancel=False, cancellable=None, limiter=None):
    return func(*args)
anyio.to_thread.run_sync = _run_sync

# Arquivos estáticos (figuras, o próprio site) são servidos pelo GitHub Pages, não por aqui.
import starlette.staticfiles as _sf
_sf_init = _sf.StaticFiles.__init__
def _sf_sem_checagem(self, *a, **k):
    k["check_dir"] = False
    _sf_init(self, *a, **k)
_sf.StaticFiles.__init__ = _sf_sem_checagem

# Bibliotecas de provedores de IA não rodam aqui (e não há chaves): um módulo vazio no lugar.
for nome in ("anthropic", "uvicorn", "imageio_ffmpeg"):
    try:
        __import__(nome)
    except Exception:
        falso = types.ModuleType(nome)
        class _Indisponivel:
            def __init__(self, *a, **k):
                raise RuntimeError("Indisponível na demonstração online.")
        falso.Anthropic = _Indisponivel
        sys.modules[nome] = falso

COOKIES = {}

def _guardar_cookies(cabecalhos):
    for k, v in cabecalhos:
        if k.lower() != "set-cookie":
            continue
        c = SimpleCookie()
        c.load(v)
        for nome, m in c.items():
            if m.value == "" or m["max-age"] in ("0", 0) or (m["expires"] and "1970" in str(m["expires"])):
                COOKIES.pop(nome, None)
            else:
                COOKIES[nome] = m.value

async def atender(metodo, url, cab_json, corpo):
    from urllib.parse import urlsplit
    from pyodide.ffi import to_js
    from app.main import app
    u = urlsplit(url)
    cab = {k.lower(): v for k, v in json.loads(cab_json).items()}
    if COOKIES:
        cab["cookie"] = "; ".join(f"{k}={v}" for k, v in COOKIES.items())
    body = bytes(corpo.to_py()) if hasattr(corpo, "to_py") else b""
    cab["content-length"] = str(len(body))
    cab.setdefault("host", "demo.local")
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": metodo, "scheme": "http",
             "path": u.path, "raw_path": u.path.encode(), "query_string": u.query.encode(), "root_path": "",
             "headers": [(k.encode("latin-1"), str(v).encode("latin-1")) for k, v in cab.items()],
             "client": ("127.0.0.1", 50000), "server": ("demo.local", 80)}
    entregue = False
    async def receive():
        nonlocal entregue
        if not entregue:
            entregue = True
            return {"type": "http.request", "body": body, "more_body": False}
        await asyncio.Event().wait()
    estado = {"status": 500, "headers": []}
    partes = []
    async def send(m):
        if m["type"] == "http.response.start":
            estado["status"] = m["status"]
            estado["headers"] = [(k.decode("latin-1"), v.decode("latin-1")) for k, v in m.get("headers", [])]
        elif m["type"] == "http.response.body":
            partes.append(m.get("body", b""))
    await app(scope, receive, send)
    _guardar_cookies(estado["headers"])
    meta = json.dumps({"status": estado["status"], "headers": [h for h in estado["headers"] if h[0].lower() != "set-cookie"]})
    return to_js([meta, b"".join(partes)])
`;let n=null;async function r(n){let r=e=>postMessage({tipo:`progresso`,etapa:e});r(`Carregando o Python no navegador`);let{loadPyodide:i}=await import(
/* @vite-ignore */
`${e}pyodide.mjs`),a=await i({indexURL:e});r(`Carregando as bibliotecas do servidor`),await a.loadPackage([`micropip`,...n.pacotes]),n.micropip.length&&await a.pyimport(`micropip`).install(n.micropip),r(`Montando o servidor da demonstração`);let o=await(await fetch(n.pacote)).arrayBuffer();a.unpackArchive(o,`zip`,{extractDir:`/repo`});for(let[e,t]of Object.entries(n.env))a.runPython(`import os; os.environ[${JSON.stringify(e)}] = ${JSON.stringify(t)}`);return await a.runPythonAsync(t),r(`Preparando os dados de exemplo`),await a.runPythonAsync(n.inicio),a}self.onmessage=async e=>{let t=e.data;if(t.tipo===`iniciar`){n=r(t);try{await n,postMessage({tipo:`pronto`})}catch(e){postMessage({tipo:`falha`,erro:String(e)})}}else try{let e=await(await n).globals.get(`atender`)(t.metodo,t.url,JSON.stringify(t.cab),t.corpo),[r,i]=e.toJs?e.toJs():e,{status:a,headers:o}=JSON.parse(r),s=new Uint8Array(i);postMessage({tipo:`res`,id:t.id,status:a,headers:o,corpo:s},{transfer:[s.buffer]})}catch(e){let n=new TextEncoder().encode(JSON.stringify({detail:`Erro na demonstração: ${String(e).slice(0,300)}`}));postMessage({tipo:`res`,id:t.id,status:500,headers:[[`content-type`,`application/json`]],corpo:n})}};