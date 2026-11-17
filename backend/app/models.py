"""Estado do usuário: sessão anônima, sacola, favoritos, listas salvas, pedidos e log do assistente."""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def agora() -> datetime:
    return datetime.now(UTC)


class Cliente(Base):
    __tablename__ = "clientes"
    sid: Mapped[str] = mapped_column(String(64), primary_key=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    lojas_separadas: Mapped[list] = mapped_column(JSON, default=list)
    cupom: Mapped[str | None] = mapped_column(String(30), nullable=True)


class ItemSacola(Base):
    """Uma linha da sacola: item + opções + observação. Mesma combinação soma quantidade."""
    __tablename__ = "itens_sacola"
    __table_args__ = (UniqueConstraint("sid", "chave", name="uq_itens_sacola_sid_chave"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sid: Mapped[str] = mapped_column(ForeignKey("clientes.sid", ondelete="CASCADE"), index=True)
    item_id: Mapped[str] = mapped_column(String(32))
    chave: Mapped[str] = mapped_column(String(64))
    qtd: Mapped[int] = mapped_column(Integer)
    opcoes: Mapped[dict] = mapped_column(JSON, default=dict)
    observacao: Mapped[str] = mapped_column(String(200), default="")
    adicionado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class Favorito(Base):
    __tablename__ = "favoritos"
    __table_args__ = (UniqueConstraint("sid", "item_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sid: Mapped[str] = mapped_column(ForeignKey("clientes.sid", ondelete="CASCADE"), index=True)
    item_id: Mapped[str] = mapped_column(String(32))
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class ListaSalva(Base):
    __tablename__ = "listas"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sid: Mapped[str] = mapped_column(ForeignKey("clientes.sid", ondelete="CASCADE"), index=True)
    nome: Mapped[str] = mapped_column(String(80))
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    itens: Mapped[list[ItemLista]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class ItemLista(Base):
    __tablename__ = "itens_lista"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lista_id: Mapped[int] = mapped_column(ForeignKey("listas.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[str] = mapped_column(String(32))
    qtd: Mapped[int] = mapped_column(Integer)


class Pedido(Base):
    __tablename__ = "pedidos"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sid: Mapped[str] = mapped_column(ForeignKey("clientes.sid", ondelete="CASCADE"), index=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    endereco: Mapped[str] = mapped_column(String(200))
    pagamento: Mapped[str] = mapped_column(String(20))
    total_itens: Mapped[float] = mapped_column(Float)
    total_taxas: Mapped[float] = mapped_column(Float)
    economia: Mapped[float] = mapped_column(Float)
    total: Mapped[float] = mapped_column(Float)
    prazo: Mapped[int] = mapped_column(Integer)
    entregas: Mapped[list] = mapped_column(JSON)
    origem: Mapped[str] = mapped_column(String(20), default="manual")
    cupom: Mapped[str | None] = mapped_column(String(30), nullable=True)
    desconto: Mapped[float] = mapped_column(Float, default=0.0)
    lojas: Mapped[list[PedidoLoja]] = relationship(cascade="all, delete-orphan", lazy="selectin",
                                                   order_by="PedidoLoja.id")


class PedidoLoja(Base):
    """Cada loja recebe só o seu pedido; recusa de uma loja estorna só a parte dela."""
    __tablename__ = "pedidos_loja"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("pedidos.id", ondelete="CASCADE"), index=True)
    loja_id: Mapped[str] = mapped_column(String(32))
    loja_nome: Mapped[str] = mapped_column(String(80))
    subtotal: Mapped[float] = mapped_column(Float)
    prazo: Mapped[int] = mapped_column(Integer)
    recusado: Mapped[bool] = mapped_column(Boolean, default=False)
    valor_estorno: Mapped[float] = mapped_column(Float, default=0.0)
    motivo_recusa: Mapped[str | None] = mapped_column(String(200), nullable=True)
    itens: Mapped[list[PedidoItem]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class PedidoItem(Base):
    __tablename__ = "pedido_itens"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pedido_loja_id: Mapped[int] = mapped_column(ForeignKey("pedidos_loja.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[str] = mapped_column(String(32))
    nome: Mapped[str] = mapped_column(String(120))
    preco: Mapped[float] = mapped_column(Float)  # unitário, já com adicionais
    qtd: Mapped[int] = mapped_column(Integer)
    opcoes: Mapped[dict] = mapped_column(JSON, default=dict)
    detalhes: Mapped[list] = mapped_column(JSON, default=list)  # nomes das opções escolhidas
    observacao: Mapped[str] = mapped_column(String(200), default="")


class EventoAssistente(Base):
    __tablename__ = "eventos_assistente"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sid: Mapped[str] = mapped_column(ForeignKey("clientes.sid", ondelete="CASCADE"), index=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    pedido: Mapped[str] = mapped_column(Text)
    motor: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))
    total: Mapped[float | None] = mapped_column(Float, nullable=True)
    ms: Mapped[int] = mapped_column(Integer, default=0)


# ---------------------------------------------------------------- contas e autenticação
class Usuario(Base):
    __tablename__ = "usuarios"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nome: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    telefone: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # só dígitos, com DDI
    senha_hash: Mapped[str] = mapped_column(String(200))
    sid: Mapped[str] = mapped_column(ForeignKey("clientes.sid"), unique=True)  # perfil de compras da conta
    telefone_verificado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    email_verificado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class DesafioAuth(Base):
    """Uma tentativa de entrada em etapas: código no WhatsApp → confirmação do e-mail → (código no e-mail)."""
    __tablename__ = "desafios_auth"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), index=True)
    etapa: Mapped[str] = mapped_column(String(20))  # whatsapp | email_confirmacao | email_codigo | concluido | bloqueado
    codigo_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    tentativas: Mapped[int] = mapped_column(Integer, default=0)
    falhas_total: Mapped[int] = mapped_column(Integer, default=0)
    reenvios: Mapped[int] = mapped_column(Integer, default=0)
    ultimo_envio_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo: Mapped[str] = mapped_column(String(20), default="entrar")  # entrar | cadastro
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class SessaoAuth(Base):
    __tablename__ = "sessoes_auth"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    dispositivo: Mapped[str] = mapped_column(String(160), default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    visto_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revogada: Mapped[bool] = mapped_column(Boolean, default=False)


class MensagemTeste(Base):
    """Caixa de entrada do MODO DE TESTES: nada aqui foi enviado de verdade."""
    __tablename__ = "mensagens_teste"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    canal: Mapped[str] = mapped_column(String(20))  # whatsapp | email
    destino: Mapped[str] = mapped_column(String(160))
    texto: Mapped[str] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=agora)


class Endereco(Base):
    __tablename__ = "enderecos"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sid: Mapped[str] = mapped_column(ForeignKey("clientes.sid", ondelete="CASCADE"), index=True)
    apelido: Mapped[str] = mapped_column(String(40))
    linha: Mapped[str] = mapped_column(String(200))
    complemento: Mapped[str] = mapped_column(String(120), default="")
    padrao: Mapped[bool] = mapped_column(Boolean, default=False)
