import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../styles.css";

describe("estilos interactivos de reincidencias", () => {
  it("limita la optimización táctil al workspace y al enlace de salto", () => {
    render(<>
      <button data-testid="generic" type="button">Acción ajena</button>
      <div className="recurrence-workspace"><button data-testid="recurrence" type="button">Acción de reincidencia</button></div>
      <a className="skip-link" href="#main-content">Saltar</a>
    </>);

    expect(getComputedStyle(screen.getByTestId("generic")).touchAction).not.toBe("manipulation");
    expect(getComputedStyle(screen.getByTestId("recurrence")).touchAction).toBe("manipulation");
    expect(getComputedStyle(screen.getByRole("link", { name: "Saltar" })).touchAction).toBe("manipulation");
  });
});
