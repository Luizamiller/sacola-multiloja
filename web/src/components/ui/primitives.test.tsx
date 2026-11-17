import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Stepper } from "./primitives";

test("stepper respeita o máximo e anuncia o valor", async () => {
  const mudou = vi.fn();
  render(<Stepper value={10} max={10} label="Poke" onChange={mudou} />);
  expect(screen.getByRole("button", { name: /Adicionar uma unidade de Poke/ })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: /Remover uma unidade de Poke/ }));
  expect(mudou).toHaveBeenCalledWith(9);
});
