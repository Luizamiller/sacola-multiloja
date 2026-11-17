/** Como o backend deste projeto sobe dentro do navegador na demonstração online. */
export const CONFIG_DEMO = {
  nome: "UMAMI",
  repo: "https://github.com/Luizamiller/umami",
  servidor: {
    pacotes: ["fastapi", "pydantic", "sqlalchemy", "argon2-cffi", "cryptography", "httpx"],
    micropip: ["pydantic-settings"],
    env: {"DATABASE_URL": "sqlite:////tmp/sacola.db"} as Record<string, string>,
    inicio: "from app.db import Base, engine\nfrom app.seed import semear\nBase.metadata.create_all(engine)\nsemear()\nfrom app.main import app",
  },
};
