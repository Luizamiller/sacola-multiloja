import os
import tempfile
from pathlib import Path

# Banco isolado e sem chave de API: os testes nunca falam com o Claude de verdade.
_tmp = Path(tempfile.mkdtemp()) / "teste.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.as_posix()}"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["MOTOR_ASSISTENTE"] = "deterministico"
os.environ["AUTH_MODO"] = "teste"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

Base.metadata.create_all(engine)
from app.seed import semear  # noqa: E402

semear()


@pytest.fixture
def client():
    from app import auth
    auth.limite_login.limpar_tudo()  # o limite antiabuso é por processo; cada teste começa do zero
    auth.limite_cadastro.limpar_tudo()
    with TestClient(app) as c:
        yield c
