from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..assistant.service import montar
from ..catalog import PADRAO
from ..config import get_settings
from ..db import get_db
from ..commerce import (Linha, OpcaoInvalida, acrescimo, agregar, aplicar_cupom, chave_linha, cupom, descrever,
                        normalizar_opcoes)
from ..models import (Cliente, Endereco, EventoAssistente, Favorito, ItemLista, ItemSacola, ListaSalva, Pedido, PedidoItem,
                      PedidoLoja, Usuario)
from ..rules import ADICIONAL_TAXA, MAX_QTD_ITEM, planejar
from .deps import cliente_atual, usuario_logado
from .serializers import item_api, loja_api, pedido_api

router = APIRouter(prefix="/api")
log = logging.getLogger("sacola.api")
CAT = PADRAO

EXEMPLOS = [
    "Jantar para 3 com sobremesa, até R$ 130",
    "Almoço vegetariano para 2 pessoas, até R$ 90",
    "Pizza para 3 pessoas",
    "Soro fisiológico, escova de dente e um hambúrguer pra mim",
    "Um poke de salmão e um missoshiro, o mais rápido possível",
]


# ---------------------------------------------------------------- catálogo
@router.get("/health")
def health():
    cfg = get_settings()
    motor = "claude" if cfg.motor_assistente in ("auto", "claude") and cfg.anthropic_api_key else "deterministico"
    return {"status": "ok", "motor_assistente": motor}


@router.get("/catalogo")
def catalogo():
    return {
        "endereco": CAT.endereco, "cliente": {"x": CAT.cliente[0], "y": CAT.cliente[1]},
        "raio_entrega_km": CAT.raio_entrega_km,
        "lojas": sorted((loja_api(l) for l in CAT.lojas), key=lambda l: (not l["na_area"], not l["aberta"], l["distancia_km"])),
        "itens": [item_api(i) for i in CAT.itens],
        "categorias": list(CAT.categorias),
        "cupons": len(CAT.cupons),
    }


# ---------------------------------------------------------------- sacola
def _linhas(db: Session, sid: str) -> list[ItemSacola]:
    rows = db.scalars(select(ItemSacola).where(ItemSacola.sid == sid).order_by(ItemSacola.adicionado_em, ItemSacola.id)).all()
    return [r for r in rows if r.item_id in CAT.itens]


def _itens(db: Session, sid: str) -> dict[str, int]:
    """Quantidade por item (formato das regras e do assistente)."""
    return agregar([Linha(r.id, r.item_id, r.qtd, r.opcoes or {}, r.observacao or "") for r in _linhas(db, sid)], CAT)[0]


def _plano(db: Session, cli: Cliente):
    linhas = _linhas(db, cli.sid)
    if not linhas:
        return linhas, None
    itens, extras = agregar([Linha(r.id, r.item_id, r.qtd, r.opcoes or {}, r.observacao or "") for r in linhas], CAT)
    return linhas, planejar(itens, separadas=cli.lojas_separadas or [], cat=CAT, acrescimos=extras)


def _linha_api(r: ItemSacola) -> dict:
    it = CAT.itens[r.item_id]
    extra = acrescimo(it, r.opcoes or {})
    return item_api(r.item_id) | {"linha_id": r.id, "qtd": r.qtd, "opcoes_escolhidas": r.opcoes or {},
                                  "detalhes": descrever(it, r.opcoes or {}), "observacao": r.observacao or "",
                                  "preco_unitario": round(it["preco"] + extra, 2)}


def _sacola(db: Session, cli: Cliente) -> dict:
    linhas, plano = _plano(db, cli)
    cupom_info = aplicar_cupom(plano, cli.cupom, CAT) if plano and cli.cupom else None
    desconto = cupom_info["desconto"] if cupom_info and cupom_info["valido"] else 0.0
    plano_api = plano.to_api() if plano else None
    if plano_api:
        plano_api["desconto"] = desconto
        plano_api["total_final"] = round(plano.total - desconto, 2)
    return {
        "itens": [_linha_api(r) for r in linhas],
        "lojas_separadas": cli.lojas_separadas or [],
        "plano": plano_api,
        "cupom": cupom_info,
    }


class QtdIn(BaseModel):
    qtd: int = Field(ge=0, le=MAX_QTD_ITEM)


@router.get("/sacola")
def ver_sacola(cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    return _sacola(db, cli)


def _checar_nova_loja(db: Session, cli: Cliente, item_id: str) -> None:
    lojas = {CAT.itens[r.item_id]["loja"] for r in _linhas(db, cli.sid)}
    if CAT.itens[item_id]["loja"] not in lojas and len(lojas) >= 4:
        raise HTTPException(409, "A sacola já tem 4 lojas. Remova uma para adicionar itens de outra.")


@router.put("/sacola/itens/{item_id}")
def definir_item(item_id: str, body: QtdIn, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    """Compatibilidade: linha simples (sem opções) de um item."""
    if item_id not in CAT.itens:
        raise HTTPException(404, "Item não encontrado no cardápio.")
    row = db.scalar(select(ItemSacola).where(ItemSacola.sid == cli.sid, ItemSacola.chave == item_id))
    if body.qtd == 0:
        if row:
            db.delete(row)
    else:
        if not CAT.disponivel(item_id) and (row is None or body.qtd > row.qtd):
            raise HTTPException(409, "Este item não está disponível agora.")
        if CAT.itens[item_id].get("opcoes") and any(g["min"] > 0 for g in CAT.itens[item_id]["opcoes"]) and row is None:
            raise HTTPException(422, "Este item tem escolhas obrigatórias. Abra o item para escolher.")
        if row is None:
            _checar_nova_loja(db, cli, item_id)
            db.add(ItemSacola(sid=cli.sid, item_id=item_id, chave=item_id, qtd=body.qtd, opcoes={}, observacao=""))
        else:
            row.qtd = body.qtd
    db.commit()
    return _sacola(db, cli)


class LinhaIn(BaseModel):
    item_id: str
    qtd: int = Field(ge=1, le=MAX_QTD_ITEM)
    opcoes: dict[str, list[str]] = Field(default_factory=dict)
    observacao: str = Field(default="", max_length=140)


@router.post("/sacola/linhas", status_code=201)
def adicionar_linha(body: LinhaIn, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    """Adiciona um item com opções e observação; mesma combinação soma quantidade."""
    it = CAT.itens.get(body.item_id)
    if not it:
        raise HTTPException(404, "Item não encontrado no cardápio.")
    if not CAT.disponivel(body.item_id):
        raise HTTPException(409, "Este item não está disponível agora.")
    try:
        opcoes = normalizar_opcoes(it, body.opcoes)
    except OpcaoInvalida as exc:
        raise HTTPException(422, str(exc))
    chave = chave_linha(body.item_id, opcoes, body.observacao)
    row = db.scalar(select(ItemSacola).where(ItemSacola.sid == cli.sid, ItemSacola.chave == chave))
    if row:
        row.qtd = min(MAX_QTD_ITEM, row.qtd + body.qtd)
    else:
        _checar_nova_loja(db, cli, body.item_id)
        db.add(ItemSacola(sid=cli.sid, item_id=body.item_id, chave=chave, qtd=body.qtd, opcoes=opcoes,
                          observacao=body.observacao.strip()))
    db.commit()
    return _sacola(db, cli)


@router.patch("/sacola/linhas/{lid}")
def alterar_linha(lid: int, body: QtdIn, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    row = db.get(ItemSacola, lid)
    if not row or row.sid != cli.sid:
        raise HTTPException(404, "Item não está na sacola.")
    if body.qtd == 0:
        db.delete(row)
    else:
        row.qtd = body.qtd
    db.commit()
    return _sacola(db, cli)


class SeparadasIn(BaseModel):
    lojas: list[str]


@router.put("/sacola/separadas")
def separar(body: SeparadasIn, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    cli.lojas_separadas = [l for l in dict.fromkeys(body.lojas) if l in CAT.lojas]
    db.commit()
    return _sacola(db, cli)


class CupomIn(BaseModel):
    codigo: str | None = Field(default=None, max_length=30)


@router.put("/sacola/cupom")
def definir_cupom(body: CupomIn, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    if body.codigo and cupom(body.codigo, CAT) is None:
        raise HTTPException(404, "Cupom não encontrado.")
    cli.cupom = body.codigo.strip().upper() if body.codigo else None
    db.commit()
    return _sacola(db, cli)


@router.get("/cupons")
def listar_cupons():
    return [c | {"loja_nome": CAT.lojas[c["loja"]]["nome"] if c.get("loja") else None} for c in CAT.cupons]


class AplicarIn(BaseModel):
    itens: dict[str, int]
    modo: Literal["substituir", "somar"] = "substituir"


def _aplicar(db: Session, cli: Cliente, itens: dict[str, int], modo: str) -> None:
    """Itens sem opções (assistente e listas salvas). Itens com escolha obrigatória recebem a primeira opção de cada grupo."""
    linhas = {r.chave: r for r in _linhas(db, cli.sid)} if modo == "somar" else {}
    lojas = {CAT.itens[r.item_id]["loja"] for r in linhas.values()}
    novos = {i: q for i, q in itens.items() if i in CAT.itens and q > 0}
    if len(lojas | {CAT.itens[i]["loja"] for i in novos}) > 4:
        raise HTTPException(409, "O resultado teria mais de 4 lojas. Substitua a sacola em vez de somar.")
    if modo == "substituir":
        db.execute(delete(ItemSacola).where(ItemSacola.sid == cli.sid))
        db.flush()
    for i, q in novos.items():
        it = CAT.itens[i]
        padrao = {g["id"]: [g["itens"][0]["id"]] for g in it.get("opcoes", []) if g["min"] > 0}
        chave = chave_linha(i, padrao, "")
        if chave in linhas:
            linhas[chave].qtd = min(MAX_QTD_ITEM, linhas[chave].qtd + q)
        else:
            db.add(ItemSacola(sid=cli.sid, item_id=i, chave=chave, qtd=min(MAX_QTD_ITEM, q), opcoes=padrao, observacao=""))
    db.commit()


@router.post("/sacola/aplicar")
def aplicar(body: AplicarIn, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    _aplicar(db, cli, body.itens, body.modo)
    return _sacola(db, cli)


@router.delete("/sacola")
def esvaziar(cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    db.execute(delete(ItemSacola).where(ItemSacola.sid == cli.sid))
    cli.lojas_separadas, cli.cupom = [], None
    db.commit()
    return _sacola(db, cli)


# ---------------------------------------------------------------- busca
def _norm(t: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", t.lower()) if not unicodedata.combining(c))


@router.get("/busca")
def buscar(q: str = Query("", max_length=80)):
    termo = _norm(q.strip())
    if len(termo) < 2:
        return {"lojas": [], "itens": []}
    lojas = [loja_api(l) for l, d in CAT.lojas.items() if termo in _norm(f"{d['nome']} {d['categoria']}")]
    itens = [item_api(i) for i, d in CAT.itens.items()
             if termo in _norm(f"{d['nome']} {d['descricao']} {' '.join(d.get('tags', []))}")]
    lojas.sort(key=lambda l: (not l["aberta"] or not l["na_area"], l["distancia_km"]))
    itens.sort(key=lambda i: (not i["disponivel"], i["preco"]))
    return {"lojas": lojas, "itens": itens}


# ---------------------------------------------------------------- endereços
class EnderecoIn(BaseModel):
    apelido: str = Field(min_length=1, max_length=40)
    linha: str = Field(min_length=5, max_length=200)
    complemento: str = Field(default="", max_length=120)
    padrao: bool = False


def _end_api(e: Endereco) -> dict:
    return {"id": e.id, "apelido": e.apelido, "linha": e.linha, "complemento": e.complemento, "padrao": e.padrao}


@router.get("/enderecos")
def enderecos(cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    rows = db.scalars(select(Endereco).where(Endereco.sid == cli.sid).order_by(Endereco.padrao.desc(), Endereco.id)).all()
    return [_end_api(e) for e in rows]


@router.post("/enderecos", status_code=201)
def criar_endereco(body: EnderecoIn, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    if body.padrao:
        for e in db.scalars(select(Endereco).where(Endereco.sid == cli.sid)):
            e.padrao = False
    e = Endereco(sid=cli.sid, apelido=body.apelido.strip(), linha=body.linha.strip(), complemento=body.complemento.strip(),
                 padrao=body.padrao)
    db.add(e)
    db.commit()
    return enderecos(cli, db)


@router.put("/enderecos/{eid}/padrao")
def endereco_padrao(eid: int, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    alvo = db.get(Endereco, eid)
    if not alvo or alvo.sid != cli.sid:
        raise HTTPException(404, "Endereço não encontrado.")
    for e in db.scalars(select(Endereco).where(Endereco.sid == cli.sid)):
        e.padrao = e.id == eid
    db.commit()
    return enderecos(cli, db)


@router.delete("/enderecos/{eid}")
def apagar_endereco(eid: int, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    e = db.get(Endereco, eid)
    if not e or e.sid != cli.sid:
        raise HTTPException(404, "Endereço não encontrado.")
    db.delete(e)
    db.commit()
    return enderecos(cli, db)


# ---------------------------------------------------------------- pedidos
class CheckoutIn(BaseModel):
    pagamento: Literal["pix", "cartao", "dinheiro"]
    origem: Literal["manual", "assistente"] = "manual"
    endereco_id: int | None = None


@router.post("/pedidos", status_code=201)
def finalizar(body: CheckoutIn, cli: Cliente = Depends(cliente_atual), u: Usuario = Depends(usuario_logado),
              db: Session = Depends(get_db)):
    linhas, plano = _plano(db, cli)
    if plano is None:
        raise HTTPException(422, {"mensagem": "A sacola está vazia.", "problemas": ["A sacola está vazia."]})
    if plano.ocorrencias:
        raise HTTPException(422, {"mensagem": "A sacola tem pendências.", "problemas": plano.problemas})
    end = db.get(Endereco, body.endereco_id) if body.endereco_id else \
        db.scalar(select(Endereco).where(Endereco.sid == cli.sid).order_by(Endereco.padrao.desc()).limit(1))
    if end is not None and end.sid != cli.sid:
        raise HTTPException(404, "Endereço não encontrado.")
    info = aplicar_cupom(plano, cli.cupom, CAT) if cli.cupom else None
    desconto = info["desconto"] if info and info["valido"] else 0.0
    prazo_loja = {l: g["prazo"] for g in plano.grupos for l in g["lojas"]}
    ped = Pedido(sid=cli.sid, endereco=(f"{end.linha}{' · ' + end.complemento if end.complemento else ''}" if end else CAT.endereco),
                 pagamento=body.pagamento, origem=body.origem, cupom=cli.cupom if desconto else None, desconto=desconto,
                 total_itens=round(plano.total_itens, 2), total_taxas=round(plano.total_taxas, 2),
                 economia=round(plano.economia, 2), total=round(plano.total - desconto, 2), prazo=plano.prazo,
                 entregas=plano.to_api()["entregas"])
    for loja, sub in plano.subtotal_por_loja.items():
        pl = PedidoLoja(loja_id=loja, loja_nome=CAT.lojas[loja]["nome"], subtotal=round(sub, 2), prazo=prazo_loja[loja])
        for r in linhas:
            it = CAT.itens[r.item_id]
            if it["loja"] == loja:
                pl.itens.append(PedidoItem(item_id=r.item_id, nome=it["nome"], preco=round(it["preco"] + acrescimo(it, r.opcoes or {}), 2),
                                           qtd=r.qtd, opcoes=r.opcoes or {}, detalhes=descrever(it, r.opcoes or {}),
                                           observacao=r.observacao or ""))
        ped.lojas.append(pl)
    db.add(ped)
    db.execute(delete(ItemSacola).where(ItemSacola.sid == cli.sid))
    cli.lojas_separadas, cli.cupom = [], None
    db.commit()
    log.info("pedido %s criado: %d lojas, total %.2f", ped.id, len(ped.lojas), ped.total)
    return pedido_api(ped)


@router.post("/pedidos/{pid}/repetir")
def repetir(pid: int, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    """Pedir de novo: devolve à sacola os itens com as mesmas opções (os que ainda estão disponíveis)."""
    p = _pedido(db, cli, pid)
    db.execute(delete(ItemSacola).where(ItemSacola.sid == cli.sid))
    fora = []
    for pl in p.lojas:
        for i in pl.itens:
            if i.item_id not in CAT.itens or not CAT.disponivel(i.item_id):
                fora.append(i.nome)
                continue
            try:
                opcoes = normalizar_opcoes(CAT.itens[i.item_id], i.opcoes or {})
            except OpcaoInvalida:
                fora.append(i.nome)
                continue
            chave = chave_linha(i.item_id, opcoes, i.observacao or "")
            db.add(ItemSacola(sid=cli.sid, item_id=i.item_id, chave=chave, qtd=i.qtd, opcoes=opcoes, observacao=i.observacao or ""))
    db.commit()
    return _sacola(db, cli) | {"indisponiveis": fora}


@router.get("/pedidos")
def listar_pedidos(cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    rows = db.scalars(select(Pedido).where(Pedido.sid == cli.sid).order_by(Pedido.id.desc())).all()
    return [pedido_api(p) for p in rows]


def _pedido(db: Session, cli: Cliente, pid: int) -> Pedido:
    p = db.get(Pedido, pid)
    if not p or p.sid != cli.sid:
        raise HTTPException(404, "Pedido não encontrado.")
    return p


@router.get("/pedidos/{pid}")
def ver_pedido(pid: int, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    return pedido_api(_pedido(db, cli, pid))


@router.post("/pedidos/{pid}/lojas/{loja_id}/recusar")
def simular_recusa(pid: int, loja_id: str, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    """Simula a recusa de uma loja: só a parte dela é estornada (itens + diferença na taxa de entrega)."""
    p = _pedido(db, cli, pid)
    pl = next((x for x in p.lojas if x.loja_id == loja_id), None)
    if pl is None:
        raise HTTPException(404, "Esta loja não faz parte do pedido.")
    if pl.recusado:
        raise HTTPException(409, "Esta loja já recusou o pedido.")
    grupo = next(g for g in p.entregas if loja_id in g["lojas"])
    restantes = [l for l in grupo["lojas"] if l != loja_id and not any(x.recusado and x.loja_id == l for x in p.lojas)]
    if not restantes:
        nova_taxa = 0.0
    elif len(restantes) == 1:
        nova_taxa = CAT.lojas[restantes[0]]["taxa"]
    else:
        nova_taxa = max(CAT.lojas[l]["taxa"] for l in restantes) + ADICIONAL_TAXA * (len(restantes) - 1)
    diferenca_taxa = max(0.0, grupo["taxa"] - nova_taxa)
    grupo_novo = dict(grupo, taxa=round(nova_taxa, 2))
    p.entregas = [grupo_novo if g is grupo else g for g in p.entregas]
    pl.recusado = True
    pl.motivo_recusa = "Loja sem condições de preparar o pedido agora (simulação)."
    pl.valor_estorno = round(pl.subtotal + diferenca_taxa, 2)
    db.commit()
    return pedido_api(p)


# ---------------------------------------------------------------- favoritos e listas
@router.get("/favoritos")
def favoritos(cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    rows = db.scalars(select(Favorito).where(Favorito.sid == cli.sid).order_by(Favorito.criado_em.desc())).all()
    return [item_api(f.item_id) for f in rows if f.item_id in CAT.itens]


@router.put("/favoritos/{item_id}")
def favoritar(item_id: str, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    if item_id not in CAT.itens:
        raise HTTPException(404, "Item não encontrado.")
    if not db.scalar(select(Favorito).where(Favorito.sid == cli.sid, Favorito.item_id == item_id)):
        db.add(Favorito(sid=cli.sid, item_id=item_id))
        db.commit()
    return favoritos(cli, db)


@router.delete("/favoritos/{item_id}")
def desfavoritar(item_id: str, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    db.execute(delete(Favorito).where(Favorito.sid == cli.sid, Favorito.item_id == item_id))
    db.commit()
    return favoritos(cli, db)


def _lista_api(l: ListaSalva) -> dict:
    itens = {i.item_id: i.qtd for i in l.itens if i.item_id in CAT.itens}
    plano = planejar(itens, cat=CAT) if itens else None
    return {"id": l.id, "nome": l.nome, "itens": [item_api(i) | {"qtd": q} for i, q in itens.items()],
            "total": plano.total if plano else 0, "lojas": len(plano.subtotal_por_loja) if plano else 0,
            "problemas": plano.problemas if plano else []}


@router.get("/listas")
def listas(cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    rows = db.scalars(select(ListaSalva).where(ListaSalva.sid == cli.sid).order_by(ListaSalva.id)).all()
    return [_lista_api(l) for l in rows]


class ListaIn(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    itens: dict[str, int] | None = None  # sem itens = salvar a sacola atual


@router.post("/listas", status_code=201)
def criar_lista(body: ListaIn, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    itens = body.itens if body.itens is not None else _itens(db, cli.sid)
    itens = {i: q for i, q in itens.items() if i in CAT.itens and q > 0}
    if not itens:
        raise HTTPException(422, "A lista precisa de pelo menos um item.")
    l = ListaSalva(sid=cli.sid, nome=body.nome.strip())
    l.itens = [ItemLista(item_id=i, qtd=q) for i, q in itens.items()]
    db.add(l)
    db.commit()
    return _lista_api(l)


@router.delete("/listas/{lid}", status_code=204)
def apagar_lista(lid: int, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    l = db.get(ListaSalva, lid)
    if not l or l.sid != cli.sid:
        raise HTTPException(404, "Lista não encontrada.")
    db.delete(l)
    db.commit()


@router.post("/listas/{lid}/aplicar")
def aplicar_lista(lid: int, body: AplicarIn | None = None, cli: Cliente = Depends(cliente_atual),
                  db: Session = Depends(get_db)):
    l = db.get(ListaSalva, lid)
    if not l or l.sid != cli.sid:
        raise HTTPException(404, "Lista não encontrada.")
    _aplicar(db, cli, {i.item_id: i.qtd for i in l.itens}, body.modo if body else "somar")
    return _sacola(db, cli)


# ---------------------------------------------------------------- assistente
class AssistenteIn(BaseModel):
    pedido: str = Field(min_length=3, max_length=400)


def _sacola_proposta(sacola: dict[str, int] | None) -> dict | None:
    if not sacola:
        return None
    return {"itens": [item_api(i) | {"qtd": q} for i, q in sacola.items()], "plano": planejar(sacola, cat=CAT).to_api()}


@router.get("/assistente/exemplos")
def exemplos():
    return EXEMPLOS


@router.post("/assistente")
def assistente(body: AssistenteIn, cli: Cliente = Depends(cliente_atual), db: Session = Depends(get_db)):
    p = montar(body.pedido.strip(), CAT)
    proposta = _sacola_proposta(p.sacola)
    db.add(EventoAssistente(sid=cli.sid, pedido=p.pedido, motor=p.motor, status=p.status,
                            total=proposta["plano"]["total"] if proposta else None, ms=p.metricas.get("ms", 0)))
    db.commit()
    return {
        "pedido": p.pedido, "motor": p.motor, "status": p.status, "resumo": p.resumo, "motivos": p.motivos,
        "aviso": p.aviso, "restricoes": p.restricoes.to_api(), "proposta": proposta,
        "alternativa": _sacola_proposta(p.alternativa), "alternativa_descricao": p.alternativa_descricao,
        "validacao": p.validacao, "metricas": p.metricas,
    }
