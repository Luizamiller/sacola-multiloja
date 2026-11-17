# UMAMI — Etapa 4: app de delivery completo

Data: 16/11/2026. Estrutura e fluxos de um app de delivery como o iFood, com a identidade da UMAMI.

## De onde vieram as decisões

| Origem | O que orientou |
|---|---|
| Captura do iFood web (C1, `02-engenharia-reversa-ifood.md`) | categorias com cor de fundo própria, faixa de cupons, carrossel de lojas, filtros em pílulas, lista de lojas com nota · categoria · distância e tempo em faixa · taxa · benefício |
| Padrões gerais de apps de delivery (não observados no iFood nesta investigação) | navegação inferior no celular, barra flutuante "Ver sacola", folha de produto com opções obrigatórias, abas do cardápio que acompanham a rolagem, histórico de busca, "pedir de novo" |
| Projeto original | sacola multi-loja, entrega combinada, pedido mínimo por loja, assistente validado |

Não foram usados código, textos, ilustrações ou logotipos do iFood. O REA não foi usado: o site do iFood bloqueia navegação automatizada (Cloudflare) e descompilar o app exigiria autorização que não existe.

## O que existe agora

| Área | Funcionalidade |
|---|---|
| Entrada | Splash; login por e-mail **ou** celular + senha; cadastro; código de 6 dígitos pelo WhatsApp (6 campos, colar, preenchimento automático `one-time-code`, contagem para reenviar, tentativas restantes); confirmação das letras escondidas do e-mail; código por e-mail quando houve erro no caminho; "continuar sem entrar" |
| Início | Endereço de entrega, busca, 10 categorias, faixa de cupons (folha com aplicar), carrossel de destaques com avanço automático, lojas por perto, mais pedidos com adicionar rápido, filtros (ordenar, entrega combinada, aberto agora, nota, pedido mínimo), lista de lojas com selos "na sacola", "entrega combinada" e cupom, mapa do bairro |
| Busca | Busca enquanto digita, abas Lojas/Itens, buscas recentes, sugestões, categorias, estado vazio com o mascote |
| Loja | Capa, logo, nota, faixa de tempo, taxa, mínimo, cupom da loja, aviso de fechada/fora da área, busca no cardápio, abas fixas que acompanham a rolagem, cartões com contador do que já está na sacola e favorito |
| Produto | Folha com opções obrigatórias (rádio) e opcionais (caixas com limite), selo obrigatório/ok, observação, quantidade, preço calculado ao vivo, botão travado até escolher o obrigatório |
| Sacola | Agrupada por loja, opções e observação de cada linha, mínimo por loja com barra, entregas combinadas e separar loja, cupom com motivo quando não vale, economia, desconto, total; barra flutuante no celular com "pulo" ao adicionar |
| Checkout | Exige login (a sacola do visitante migra), escolha de endereço, pagamento simulado, cupom e totais |
| Pedidos | Confirmação com o mascote, linha do tempo por loja, entregador simulado, estorno parcial na recusa, desconto, "pedir de novo" |
| Perfil | Dados da conta, endereços (padrão, novo, apagar), favoritos e listas, cupons, sessões ativas com encerrar, sair |

## Segurança da autenticação

Argon2 nas senhas · códigos guardados só como HMAC · validade de 10 min · 5 tentativas por código e bloqueio · reenvio após 60 s, no máximo 3 · limite de tentativas de login por identificador + IP · sessões com token aleatório guardado como HMAC, cookie httpOnly/SameSite, revogáveis · em produção a API não sobe com `AUTH_MODO=teste` ou com o segredo de desenvolvimento.

## Limites honestos

- **WhatsApp e e-mail reais** exigem `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, um modelo de autenticação aprovado na Meta e SMTP. Até lá, só o modo de testes, sinalizado na tela.
- **Fotos**: os itens usam ilustração com ícone e cor; o catálogo tem o campo `imagem` pronto para fotos licenciadas.
- **Endereço**: a distância até as lojas usa a posição fixa do bairro da demonstração.
- **Entregador e acompanhamento** são simulados (e rotulados).
- O limite de tentativas é por processo; em produção, usar Redis.
- Comportamentos do iFood além da captura C1 continuam "a investigar" e não foram copiados.
