# UMAMI — decisões e limitações antes de implementar

## Autenticação: arquitetura proposta

```
1. POST /auth/entrar  {identificador: e-mail ou telefone, senha}
      → Argon2 confere a senha; limite por identificador + IP
      → cria "desafio" (id, usuário, expira em 10 min, tentativas restantes = 5)
2. Envia código de 6 dígitos (guardado só como hash) pelo canal WhatsApp
3. POST /auth/desafios/{id}/codigo  {codigo}
      → confere hash, expiração e tentativas; reenvio liberado após 60 s, máximo 3
4. Mostra o e-mail mascarado (lu***@g***.com) e pede os caracteres ausentes
      → em caso de dúvida (dispositivo novo, muitas falhas), envia código por e-mail
5. Libera: sessão com cookie httpOnly, SameSite, renovação, registro do dispositivo
      → a sacola anônima atual é migrada para a conta
```

Modo de testes: com `AUTH_CANAL=teste`, nenhum envio acontece; o código aparece numa **caixa de entrada de desenvolvimento** com faixa "AMBIENTE DE TESTES" e a API recusa subir assim fora do ambiente de desenvolvimento. Nenhuma mensagem simulada é apresentada como real.

## Decisões que são suas

| # | Decisão | Opções | Minha recomendação |
|---|---|---|---|
| 1 | Provedor do WhatsApp | WhatsApp Business Cloud API (Meta, direto) · provedor autorizado (Twilio, Zenvia, Gupshup…) | Cloud API da Meta: modelo de mensagem de **autenticação** oficial, custo menor. Exige conta Business verificada, número dedicado e modelo aprovado — passos seus, com seus dados |
| 2 | Envio de e-mail | SMTP próprio · Resend · Amazon SES · SendGrid | Resend ou SES. Até lá, só o modo de testes |
| 3 | Mascote em novas poses | (a) você fornece ilustrações · (b) contratar ilustração · (c) uso só da referência, sem novas poses | (a) ou (b). Não vou desenhar variações do personagem à mão em SVG fingindo que são a mesma ilustração |
| 4 | Fotos de comida | banco com licença comercial · fotos próprias · gerar por IA com rótulo | banco licenciado (ex.: Unsplash/Pexels com verificação de licença) ou fotos próprias |
| 5 | Cupons × orçamento do assistente | orçamento vale antes · depois do cupom | depois do cupom (é o que a pessoa paga), com a validação refletindo isso |
| 6 | Escopo internacional agora | só pt-BR com textos extraídos para i18n · já incluir en/es | extrair textos para i18n desde já, lançar em pt-BR |

## Limitações registradas

- O site do iFood bloqueia navegação automatizada (Cloudflare). A engenharia reversa depende das suas capturas e gravações.
- Comportamentos do iFood só entram como "observados" quando aparecem numa captura ou gravação.
- A identidade do iFood (nome, logos, ilustrações 3D, textos próprios, layout pixel a pixel) não será reproduzida.
