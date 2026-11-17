"""Conta de demonstração da UMAMI (dados fictícios).

Uso:  uv run python -m app.seed
"""
from sqlalchemy import select

from .api.deps import novo_cliente
from .auth import hash_senha, normalizar_telefone
from .db import SessionLocal
from .models import Usuario, agora

DEMO = {"nome": "Ana Demo", "email": "demo@umami.app", "telefone": "(11) 98888-0000", "senha": "umami-demo-2026"}


def semear() -> bool:
    with SessionLocal() as db:
        if db.scalar(select(Usuario).where(Usuario.email == DEMO["email"])):
            return False
        perfil = novo_cliente(db)
        db.add(Usuario(nome=DEMO["nome"], email=DEMO["email"], telefone=normalizar_telefone(DEMO["telefone"]),
                       senha_hash=hash_senha(DEMO["senha"]), sid=perfil.sid, telefone_verificado_em=agora(),
                       email_verificado_em=agora()))
        db.commit()
        return True


if __name__ == "__main__":
    print("Conta de demonstração criada." if semear() else "Conta de demonstração já existia.")
