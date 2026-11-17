from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from .. import auth as A
from ..config import get_settings
from ..db import get_db
from ..models import ItemSacola, MensagemTeste, SessaoAuth, Usuario, agora
from .deps import COOKIE, novo_cliente, usuario_logado

router = APIRouter(prefix="/api/auth", tags=["autenticação"])


def _ip(r: Request) -> str:
    return r.client.host if r.client else "?"


def usuario_api(u: Usuario) -> dict:
    return {"id": u.id, "nome": u.nome, "email": u.email, "telefone": A.mascarar_telefone(u.telefone),
            "primeiro_nome": u.nome.split()[0]}


class EntrarIn(BaseModel):
    identificador: str = Field(min_length=3, max_length=160)
    senha: str = Field(min_length=1, max_length=200)


class CadastroIn(BaseModel):
    nome: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=160, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    telefone: str = Field(min_length=8, max_length=24)
    senha: str = Field(min_length=8, max_length=200)


@router.post("/entrar")
def entrar(body: EntrarIn, request: Request, db: Session = Depends(get_db)):
    A.limite_login.checar(f"{body.identificador.lower()}|{_ip(request)}")
    u = A.identificar(db, body.identificador)
    if not u or not A.conferir_senha(u.senha_hash, body.senha):
        raise HTTPException(401, "E-mail, telefone ou senha incorretos.")
    d = A.criar_desafio(db, u, "entrar")
    db.commit()
    return A.desafio_api(d, u)


@router.post("/cadastro", status_code=201)
def cadastro(body: CadastroIn, request: Request, db: Session = Depends(get_db)):
    A.limite_cadastro.checar(_ip(request))
    email, tel = body.email.strip().lower(), A.normalizar_telefone(body.telefone)
    if db.scalar(select(Usuario).where((Usuario.email == email) | (Usuario.telefone == tel))):
        raise HTTPException(409, "Já existe uma conta com este e-mail ou telefone. Entre com ela.")
    perfil = novo_cliente(db)
    u = Usuario(nome=body.nome.strip(), email=email, telefone=tel, senha_hash=A.hash_senha(body.senha), sid=perfil.sid)
    db.add(u)
    db.flush()
    d = A.criar_desafio(db, u, "cadastro")
    db.commit()
    return A.desafio_api(d, u)


@router.get("/desafios/{did}")
def ver_desafio(did: str, db: Session = Depends(get_db)):
    d, u = A.obter_desafio(db, did)
    return A.desafio_api(d, u)


class CodigoIn(BaseModel):
    codigo: str = Field(min_length=6, max_length=12)


def _concluir(db: Session, d, u: Usuario, request: Request, response: Response) -> dict:
    d.etapa = "concluido"
    token = A.criar_sessao(db, u, request.headers.get("user-agent", ""))
    if d.motivo == "cadastro":
        u.telefone_verificado_em = u.telefone_verificado_em or agora()
    # a sacola montada como visitante vai para a conta, se a da conta estiver vazia
    anonimo = request.cookies.get(COOKIE)
    if anonimo and anonimo != u.sid:
        tem = db.scalar(select(ItemSacola.id).where(ItemSacola.sid == u.sid).limit(1))
        if not tem:
            db.execute(update(ItemSacola).where(ItemSacola.sid == anonimo).values(sid=u.sid))
    db.commit()
    cfg = get_settings()
    response.set_cookie(A.COOKIE_SESSAO, token, httponly=True, samesite="lax", secure=cfg.cookie_seguro,
                        max_age=cfg.sessao_dias * 86400, path="/")
    return {"etapa": "concluido", "usuario": usuario_api(u)}


@router.post("/desafios/{did}/codigo")
def confirmar_codigo(did: str, body: CodigoIn, request: Request, response: Response, db: Session = Depends(get_db)):
    d, u = A.obter_desafio(db, did)
    if d.etapa not in ("whatsapp", "email_codigo"):
        raise HTTPException(409, "Esta etapa não espera um código.")
    A.conferir_codigo(db, d, body.codigo)
    if d.etapa == "whatsapp":
        u.telefone_verificado_em = u.telefone_verificado_em or agora()
        d.etapa = "email_confirmacao"
        db.commit()
        return A.desafio_api(d, u)
    u.email_verificado_em = agora()
    return _concluir(db, d, u, request, response)


class EmailIn(BaseModel):
    faltantes: str = Field(min_length=1, max_length=160)


@router.post("/desafios/{did}/email")
def confirmar_email(did: str, body: EmailIn, request: Request, response: Response, db: Session = Depends(get_db)):
    d, u = A.obter_desafio(db, did)
    if d.etapa != "email_confirmacao":
        raise HTTPException(409, "Esta etapa não espera o e-mail.")
    _, escondido, _ = A.partes_email(u.email)
    if body.faltantes.strip().lower() != escondido:
        d.tentativas += 1
        d.falhas_total += 1
        if d.tentativas >= A.MAX_TENTATIVAS:
            d.etapa = "bloqueado"
            db.commit()
            raise HTTPException(429, "Muitas tentativas. Entre de novo.")
        db.commit()
        raise HTTPException(400, "Não confere com o e-mail cadastrado. Confira as letras.")
    d.tentativas = 0
    if d.falhas_total > 0:  # houve erro no caminho: confirma também por código no e-mail
        A.iniciar_codigo_email(db, d, u)
        db.commit()
        return A.desafio_api(d, u)
    return _concluir(db, d, u, request, response)


@router.post("/desafios/{did}/reenviar")
def reenviar(did: str, db: Session = Depends(get_db)):
    d, u = A.obter_desafio(db, did)
    if d.etapa not in ("whatsapp", "email_codigo"):
        raise HTTPException(409, "Não há código para reenviar nesta etapa.")
    A.reenviar(db, d, u)
    db.commit()
    return A.desafio_api(d, u)


@router.get("/eu")
def eu(request: Request, db: Session = Depends(get_db)):
    s = A.sessao_por_token(db, request.cookies.get(A.COOKIE_SESSAO))
    if not s:
        return {"usuario": None, "modo_teste": A.modo_teste()}
    return {"usuario": usuario_api(db.get(Usuario, s.usuario_id)), "modo_teste": A.modo_teste()}


@router.post("/sair")
def sair(request: Request, response: Response, db: Session = Depends(get_db)):
    s = A.sessao_por_token(db, request.cookies.get(A.COOKIE_SESSAO))
    if s:
        s.revogada = True
        db.commit()
    response.delete_cookie(A.COOKIE_SESSAO, path="/")
    response.delete_cookie(COOKIE, path="/")  # volta a visitante com sacola nova
    return {"ok": True}


@router.get("/sessoes")
def sessoes(request: Request, u: Usuario = Depends(usuario_logado), db: Session = Depends(get_db)):
    atual = A.sessao_por_token(db, request.cookies.get(A.COOKIE_SESSAO))
    rows = db.scalars(select(SessaoAuth).where(SessaoAuth.usuario_id == u.id, SessaoAuth.revogada.is_(False))
                      .order_by(SessaoAuth.visto_em.desc())).all()
    return [{"id": s.id, "dispositivo": s.dispositivo or "Navegador", "criado_em": A.utc(s.criado_em).isoformat(),
             "visto_em": A.utc(s.visto_em).isoformat(), "atual": atual is not None and s.id == atual.id} for s in rows]


@router.delete("/sessoes/{sid}")
def encerrar_sessao(sid: int, u: Usuario = Depends(usuario_logado), db: Session = Depends(get_db)):
    s = db.get(SessaoAuth, sid)
    if not s or s.usuario_id != u.id:
        raise HTTPException(404, "Sessão não encontrada.")
    s.revogada = True
    db.commit()
    return {"ok": True}


@router.get("/caixa-de-testes")
def caixa_de_testes(db: Session = Depends(get_db)):
    """Só no modo de testes: mensagens que TERIAM sido enviadas. Em produção, a rota responde 404."""
    if not A.modo_teste():
        raise HTTPException(404, "Não encontrado.")
    rows = db.scalars(select(MensagemTeste).order_by(MensagemTeste.id.desc()).limit(10)).all()
    return [{"id": m.id, "canal": m.canal, "destino": m.destino, "texto": m.texto, "criado_em": A.utc(m.criado_em).isoformat()} for m in rows]


@router.delete("/caixa-de-testes")
def limpar_caixa(db: Session = Depends(get_db)):
    if not A.modo_teste():
        raise HTTPException(404, "Não encontrado.")
    db.execute(delete(MensagemTeste))
    db.commit()
    return {"ok": True}
