from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'sacola.db').as_posix()}"
    cors_origins: list[str] = ["http://localhost:5104", "http://127.0.0.1:5104"]
    anthropic_api_key: str | None = None
    modelo_claude: str = "claude-sonnet-5-5"
    # auto = Claude quando houver chave, senão planejador determinístico
    motor_assistente: str = "auto"
    log_level: str = "INFO"
    ambiente: str = "desenvolvimento"
    # Autenticação. "teste": nenhuma mensagem sai; códigos vão para a caixa de testes (só em desenvolvimento).
    auth_modo: str = "teste"
    segredo: str = "dev-somente-local-troque-em-producao-umami-0123456789"
    sessao_dias: int = 30
    # WhatsApp Business Cloud API (Meta) — modelo de mensagem de autenticação aprovado
    whatsapp_token: str | None = None
    whatsapp_phone_number_id: str | None = None
    whatsapp_template: str = "umami_codigo"
    whatsapp_idioma: str = "pt_BR"
    # E-mail (SMTP)
    smtp_host: str | None = None
    smtp_porta: int = 587
    smtp_usuario: str | None = None
    smtp_senha: str | None = None
    smtp_remetente: str = "UMAMI <nao-responda@umami.app>"
    cookie_seguro: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
