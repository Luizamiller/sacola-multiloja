import { iniciais, reais } from "../utils";

test("formata reais no padrão brasileiro", () => {
  expect(reais(126.58)).toBe("R$ 126,58");
  expect(reais(1234.5)).toBe("R$ 1.234,50");
});

test("monograma da loja ignora conectores", () => {
  expect(iniciais("Mar & Arroz")).toBe("MA");
  expect(iniciais("Açaí da Praça")).toBe("AP");
});
