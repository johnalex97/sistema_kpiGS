import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "../../styles.css";

function mediaRule(condition: string): CSSMediaRule {
  const rules = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules));
  const rule = rules.find((candidate): candidate is CSSMediaRule => (
    "conditionText" in candidate && candidate.conditionText === condition
  ));
  if (!rule) throw new Error(`No se encontró la regla responsive ${condition}`);
  return rule;
}

function declaration(rule: CSSMediaRule, selector: string): CSSStyleDeclaration {
  const styleRule = Array.from(rule.cssRules).find((candidate): candidate is CSSStyleRule => {
    const selectorText = (candidate as CSSStyleRule).selectorText;
    return typeof selectorText === "string"
      && selectorText.split(",").map((item: string) => item.trim()).includes(selector);
  });
  if (!styleRule) throw new Error(`No se encontró el selector ${selector}`);
  return styleRule.style;
}

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
  it("reserva un objetivo de 44 por 44 para limpiar filtros de alcance en tableta y móvil", () => {
    const tablet = mediaRule("(max-width: 940px)");
    const clearButton = declaration(tablet, ".recurrence-scope-combobox__control > button");
    const input = declaration(tablet, ".recurrence-scope-combobox__control input");

    expect(clearButton.width).toBe("44px");
    expect(clearButton.minWidth).toBe("44px");
    expect(input.paddingRight).toBe("51px");
  });
});
