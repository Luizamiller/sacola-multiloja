"""Contas UMAMI: senha + código de 6 dígitos no WhatsApp + confirmação do e-mail.

Fluxo (docs/umami/04-pendencias.md):
  1. /auth/entrar ou /auth/cadastro → valida credenciais e cria um DesafioAuth (etapa "whatsapp")
  2. envia código de 6 dígitos pelo canal configurado (só o hash fica no banco; expira em 10 min)
  3. /auth/desafios/{id}/codigo → confere código, expiração e tentativas (5)
  4. etapa "email_confirmacao": o usuário completa as letras escondidas do e-mail
  5. se houve falhas na tentativa, exige também um código enviado ao e-mail (etapa "email_codigo")
  6. concluído → sessão com cookie httpOnly; a sacola anônima migra para a conta

Modo de testes (AUTH_MODO=teste, só em desenvolvimento): nada é enviado; as mensagens vão para a
tabela `mensagens_teste`, que a interface mostra como "caixa de testes". Nunca se finge envio real.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import re
import secrets
import smtplib
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage

import httpx
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import DesafioAuth, MensagemTeste, SessaoAuth, Usuario, agora

log = logging.getLogger("umami.auth")
_ph = PasswordHasher()
VALIDADE_CODIGO = timedelta(minutes=10)
ESPERA_REENVIO = 60
MAX_TENTATIVAS = 5
MAX_REENVIOS = 3
COOKIE_SESSAO = "umami_sessao"


def utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


# ------------------------------------------------------------------ senhas, códigos, identificadores
def hash_senha(s: str) -> str:
    return _ph.hash(s)


def conferir_senha(h: str, s: str) -> bool:
    try:
        return _ph.verify(h, s)
    except (VerifyMismatchError, Exception):
        return False


def _hmac(valor: str) -> str:
    return hmac.new(get_settings().segredo.encode(), valor.encode(), hashlib.sha256).hexdigest()


def novo_codigo() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def so_digitos(t: str) -> str:
    return re.sub(r"\D", "", t or "")


def normalizar_telefone(t: str) -> str:
    d = so_digitos(t)
    if len(d) in (10, 11):  # número brasileiro sem DDI
        d = "55" + d
    if not 12 <= len(d) <= 15:
        raise HTTPException(422, "Telefone inválido. Use DDD e número, ex.: (11) 91234-5678.")
    return d


def mascarar_telefone(d: str) -> str:
    return f"+{d[:2]} ({d[2:4]}) •••••-{d[-4:]}"


def partes_email(email: str) -> tuple[str, str, str]:
    """Divide o e-mail em (início visível, trecho escondido, fim visível). O usuário digita o trecho escondido."""
    local, _, dominio = email.partition("@")
    if len(local) <= 3:
        return local[:1], local[1:], "@" + dominio
    return local[:2], local[2:-1], local[-1] + "@" + dominio


def identificar(db: Session, identificador: str) -> Usuario | None:
    ident = identificador.strip().lower()
    if "@" in ident:
        return db.scalar(select(Usuario).where(Usuario.email == ident))
    try:
        return db.scalar(select(Usuario).where(Usuario.telefone == normalizar_telefone(ident)))
    except HTTPException:
        return None


# ------------------------------------------------------------------ limites contra abuso (por processo)
class Limite:
    def __init__(self, maximo: int, janela_s: int):
        self.maximo, self.janela = maximo, janela_s
        self._t: dict[str, deque] = defaultdict(deque)

    def checar(self, chave: str) -> None:
        agora_ = time.monotonic()
        fila = self._t[chave]
        while fila and agora_ - fila[0] > self.janela:
            fila.popleft()
        if len(fila) >= self.maximo:
            raise HTTPException(429, "Muitas tentativas. Aguarde alguns minutos e tente de novo.")
        fila.append(agora_)

    def limpar(self, chave: str) -> None:
        self._t.pop(chave, None)

    def limpar_tudo(self) -> None:
        self._t.clear()


limite_login = Limite(6, 300)
limite_cadastro = Limite(5, 3600)


# ------------------------------------------------------------------ canais de envio
def modo_teste() -> bool:
    return get_settings().auth_modo == "teste"


def enviar_whatsapp(db: Session, telefone: str, codigo: str) -> None:
    cfg = get_settings()
    if modo_teste():
        db.add(MensagemTeste(canal="whatsapp", destino=mascarar_telefone(telefone),
                             texto=f"{codigo} é o seu código de acesso à UMAMI. Ele expira em 10 minutos. Não compartilhe."))
        return
    if not (cfg.whatsapp_token and cfg.whatsapp_phone_number_id):
        raise HTTPException(503, "Envio pelo WhatsApp não está configurado neste servidor.")
    # WhatsApp Business Cloud API: modelo de categoria AUTHENTICATION com o código como parâmetro.
    r = httpx.post(
        f"https://graph.facebook.com/v21.0/{cfg.whatsapp_phone_number_id}/messages",
        headers={"Authorization": f"Bearer {cfg.whatsapp_token}"},
        json={"messaging_product": "whatsapp", "to": telefone, "type": "template",
              "template": {"name": cfg.whatsapp_template, "language": {"code": cfg.whatsapp_idioma},
                           "components": [{"type": "body", "parameters": [{"type": "text", "text": codigo}]},
                                          {"type": "button", "sub_type": "url", "index": "0",
                                           "parameters": [{"type": "text", "text": codigo}]}]}},
        timeout=15)
    if r.status_code >= 300:
        log.error("WhatsApp recusou o envio: %s", r.status_code)
        raise HTTPException(502, "Não foi possível enviar o código pelo WhatsApp agora.")


def enviar_email(db: Session, email: str, codigo: str) -> None:
    cfg = get_settings()
    if modo_teste():
        db.add(MensagemTeste(canal="email", destino=email,
                             texto=f"Seu código de confirmação da UMAMI é {codigo}. Ele expira em 10 minutos."))
        return
    if not cfg.smtp_host:
        raise HTTPException(503, "Envio de e-mail não está configurado neste servidor.")
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = "Seu código UMAMI", cfg.smtp_remetente, email
    msg.set_content(f"Seu código de confirmação da UMAMI é {codigo}. Ele expira em 10 minutos.")
    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_porta, timeout=15) as s:
        s.starttls()
        if cfg.smtp_usuario:
            s.login(cfg.smtp_usuario, cfg.smtp_senha or "")
        s.send_message(msg)


# ------------------------------------------------------------------ desafios
def criar_desafio(db: Session, u: Usuario, motivo: str) -> DesafioAuth:
    codigo = novo_codigo()
    d = DesafioAuth(id=secrets.token_urlsafe(18), usuario_id=u.id, etapa="whatsapp", codigo_hash=_hmac(codigo),
                    expira_em=agora() + VALIDADE_CODIGO, ultimo_envio_em=agora(), motivo=motivo)
    db.add(d)
    enviar_whatsapp(db, u.telefone, codigo)
    return d


def desafio_api(d: DesafioAuth, u: Usuario) -> dict:
    ini, escondido, fim = partes_email(u.email)
    espera = 0
    if d.ultimo_envio_em:
        espera = max(0, ESPERA_REENVIO - int((agora() - utc(d.ultimo_envio_em)).total_seconds()))
    return {
        "id": d.id, "etapa": d.etapa, "telefone": mascarar_telefone(u.telefone),
        "email": {"inicio": ini, "faltam": len(escondido), "fim": fim} if d.etapa in ("email_confirmacao", "email_codigo") else None,
        "email_mascarado": f"{ini}{'•' * len(escondido)}{fim}",
        "tentativas_restantes": MAX_TENTATIVAS - d.tentativas, "reenvio_em_s": espera,
        "reenvios_restantes": MAX_REENVIOS - d.reenvios, "expira_em": utc(d.expira_em).isoformat(),
        "modo_teste": modo_teste(),
    }


def obter_desafio(db: Session, did: str) -> tuple[DesafioAuth, Usuario]:
    d = db.get(DesafioAuth, did)
    if not d or d.etapa in ("concluido", "bloqueado"):
        raise HTTPException(404, "Esta verificação não está mais ativa. Entre de novo.")
    return d, db.get(Usuario, d.usuario_id)


def conferir_codigo(db: Session, d: DesafioAuth, codigo: str) -> None:
    if utc(d.expira_em) < agora():
        raise HTTPException(410, "O código expirou. Peça um novo.")
    if not hmac.compare_digest(d.codigo_hash or "", _hmac(so_digitos(codigo))):
        d.tentativas += 1
        d.falhas_total += 1
        if d.tentativas >= MAX_TENTATIVAS:
            d.etapa = "bloqueado"
            db.commit()
            raise HTTPException(429, "Muitas tentativas com código errado. Entre de novo para receber outro.")
        db.commit()
        raise HTTPException(400, f"Código incorreto. Restam {MAX_TENTATIVAS - d.tentativas} tentativas.")
    d.tentativas, d.codigo_hash = 0, None


def reenviar(db: Session, d: DesafioAuth, u: Usuario) -> None:
    if d.reenvios >= MAX_REENVIOS:
        raise HTTPException(429, "Limite de reenvios atingido. Entre de novo mais tarde.")
    if d.ultimo_envio_em and (agora() - utc(d.ultimo_envio_em)).total_seconds() < ESPERA_REENVIO:
        raise HTTPException(429, "Aguarde para pedir um novo código.")
    codigo = novo_codigo()
    d.codigo_hash, d.expira_em, d.tentativas = _hmac(codigo), agora() + VALIDADE_CODIGO, 0
    d.reenvios += 1
    d.ultimo_envio_em = agora()
    (enviar_whatsapp if d.etapa == "whatsapp" else enviar_email)(db, u.telefone if d.etapa == "whatsapp" else u.email, codigo)


def iniciar_codigo_email(db: Session, d: DesafioAuth, u: Usuario) -> None:
    codigo = novo_codigo()
    d.etapa, d.codigo_hash, d.expira_em, d.tentativas, d.reenvios = "email_codigo", _hmac(codigo), agora() + VALIDADE_CODIGO, 0, 0
    d.ultimo_envio_em = agora()
    enviar_email(db, u.email, codigo)


# ------------------------------------------------------------------ sessões
def criar_sessao(db: Session, u: Usuario, dispositivo: str) -> str:
    token = secrets.token_urlsafe(32)
    db.add(SessaoAuth(usuario_id=u.id, token_hash=_hmac(token), dispositivo=dispositivo[:160],
                      expira_em=agora() + timedelta(days=get_settings().sessao_dias)))
    return token


def sessao_por_token(db: Session, token: str | None) -> SessaoAuth | None:
    if not token:
        return None
    s = db.scalar(select(SessaoAuth).where(SessaoAuth.token_hash == _hmac(token)))
    if not s or s.revogada or utc(s.expira_em) < agora():
        return None
    if (agora() - utc(s.visto_em)).total_seconds() > 300:
        s.visto_em = agora()
        db.commit()
    return s
