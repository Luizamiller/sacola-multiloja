import { expect, test, type Page } from "@playwright/test";

// A splash aparece uma vez por sessão; nos fluxos ela é pulada (há um teste próprio para ela).
test.beforeEach(async ({ page }, info) => {
  if (!info.title.includes("splash")) await page.addInitScript(() => sessionStorage.setItem("umami-splash", "1"));
});

async function entrar(page: Page, voltar = "/") {
  await page.goto(`/entrar?voltar=${encodeURIComponent(voltar)}`);
  await page.getByLabel("E-mail ou celular").fill("demo@umami.app");
  await page.getByLabel("Senha", { exact: true }).fill("umami-demo-2026");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Confira seu WhatsApp" })).toBeVisible();
  await page.getByRole("button", { name: /Usar código \d{6}/ }).click();   // caixa de testes: nada é enviado de verdade
  await expect(page.getByRole("heading", { name: "Confirme seu e-mail" })).toBeVisible();
  await page.getByLabel("Letras que faltam no e-mail").fill("m");  // demo@umami.app → "de" + "m" + "o@umami.app"
  await page.getByRole("button", { name: "Confirmar e entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"));
}

test("identidade UMAMI: título, manifest e splash da primeira visita", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/UMAMI/);
  await expect(page.getByRole("status", { name: "Carregando UMAMI" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Carregando UMAMI" })).toBeHidden({ timeout: 3000 });
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe("UMAMI");
});

test("login em etapas com código do WhatsApp (modo de testes) e e-mail mascarado", async ({ page }) => {
  await entrar(page, "/perfil");
  await expect(page.getByRole("heading", { name: "Olá, Ana" })).toBeVisible();
  await page.screenshot({ path: "test-results/perfil.png" });
});

test("compra completa: produto com opções, cupom, checkout logado e acompanhamento", async ({ page }) => {
  await entrar(page);
  await page.request.delete("/api/sacola");
  await page.goto("/loja/brasa");
  await page.getByRole("button", { name: "Adicionar Smash duplo" }).click();
  const folha = page.getByRole("dialog");
  await expect(folha.getByText("obrigatório")).toBeVisible();
  await expect(folha.getByRole("button", { name: /Escolha: ponto da carne/ })).toBeDisabled();
  await folha.getByRole("radio", { name: "Ao ponto" }).click();
  await folha.getByRole("checkbox", { name: /Bacon crocante/ }).click();
  await folha.getByLabel(/Alguma observação/).fill("sem cebola");
  await folha.getByRole("button", { name: "Aumentar" }).click();
  await expect(folha.getByRole("button", { name: /Adicionar.*R\$ 74,80/ })).toBeVisible();   // (32,90 + 4,50) × 2
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/produto.png" });
  await folha.getByRole("button", { name: /Adicionar/ }).click();
  await expect(folha).toBeHidden();

  await page.request.put("/api/sacola/cupom", { data: { codigo: "BRASA15" } });
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Revisar pedido" })).toBeVisible();
  await expect(page.getByText("Cupom BRASA15")).toBeVisible();
  await page.getByRole("button", { name: /Fazer pedido/ }).click();
  await expect(page).toHaveURL(/\/pedidos\/\d+/);
  await expect(page.getByText("Pedido enviado às lojas")).toBeVisible();
  await expect(page.getByText("Bacon crocante")).toBeVisible();
});

test("visitante monta a sacola e o checkout pede login", async ({ page }) => {
  await page.goto("/loja/acai");
  await page.getByRole("button", { name: "Adicionar Creme de cupuaçu" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Adicionar/ }).click();
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Entre para finalizar" })).toBeVisible();
});

test("busca por item abre a folha do produto", async ({ page }) => {
  await page.goto("/busca?q=poke");
  await page.getByRole("tab", { name: /Itens/ }).click();
  await page.getByRole("button", { name: /Poke tofu/ }).click();
  await expect(page.getByRole("dialog").getByRole("group", { name: "Base" })).toBeVisible();
});

test("assistente continua validando antes de montar a sacola", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Montar com o assistente" }).first().click();
  const painel = page.getByRole("dialog");
  await painel.getByLabel("O que você quer pedir?").fill("Tacos para 2");
  await painel.getByLabel("O que você quer pedir?").press("Enter");
  await expect(painel.getByText("Não dá para montar exatamente isso")).toBeVisible();
});
