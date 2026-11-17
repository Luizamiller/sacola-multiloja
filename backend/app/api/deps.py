import secrets

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from ..auth import COOKIE_SESSAO, sessao_por_token
from ..catalog import PADRAO
from ..db import get_db
from ..models import Cliente, Endereco, ItemLista, ListaSalva, Usuario

COOKIE = "sacola_sid"  # nome mantido por compatibilidade com sessões e dados anteriores à UMAMI


def novo_cliente(db: Session) -> Cliente:
    """Perfil de compras novo, com a lista 'Sexta de sempre' e o endereço da demonstração."""
    cli = Cliente(sid=secrets.token_urlsafe(24), lojas_separadas=[])
    db.add(cli)
    lista = ListaSalva(sid=cli.sid, nome="Sexta de sempre")
    lista.itens = [ItemLista(item_id=i, qtd=q) for i, q in (("b1", 2), ("b2", 1), ("a1", 1)) if i in PADRAO.itens]
    db.add(lista)
    db.add(Endereco(sid=cli.sid, apelido="Casa", linha=PADRAO.endereco, padrao=True))
    return cli


def usuario_opcional(request: Request, db: Session = Depends(get_db)) -> Usuario | None:
    s = sessao_por_token(db, request.cookies.get(COOKIE_SESSAO))
    return db.get(Usuario, s.usuario_id) if s else None


def usuario_logado(u: Usuario | None = Depends(usuario_opcional)) -> Usuario:
    if u is None:
        raise HTTPException(401, "Entre na sua conta para continuar.")
    return u


def cliente_atual(request: Request, response: Response, db: Session = Depends(get_db),
                  u: Usuario | None = Depends(usuario_opcional)) -> Cliente:
    """Logado: o perfil de compras da conta. Visitante: sessão anônima por cookie (pode navegar e montar a sacola)."""
    if u is not None:
        return db.get(Cliente, u.sid)
    sid = request.cookies.get(COOKIE)
    cli = db.get(Cliente, sid) if sid else None
    if cli is None or db.query(Usuario).filter(Usuario.sid == cli.sid).first():
        cli = novo_cliente(db)  # nunca reaproveita, sem login, o perfil de uma conta
        db.commit()
        response.set_cookie(COOKIE, cli.sid, httponly=True, samesite="lax", max_age=60 * 60 * 24 * 180)
    return cli
