import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { historyFixture } from "../../api/kpi-history.fixture";
import { KpiHistoryChart } from "./KpiHistoryChart";
import { KpiHistoryTable } from "./KpiHistoryTable";

describe("official history visualization", () => {
  it("breaks lines at absent values and draws a genuine zero", () => {
    const points = historyFixture.points.slice(0, 4).map((p, i) => ({ ...p, scores: { ...p.scores, overall: ["70", null, "0", "90"][i]! } }));
    const { container } = render(<KpiHistoryChart points={points} metric="overall" granularity="WEEK" />);
    expect(screen.getByRole("img", { name: /Índice general/ })).toBeInTheDocument();
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    expect(container.querySelector('circle[data-value="0"]')).toBeInTheDocument();
    expect(container.querySelector("polyline")?.getAttribute("points")?.split(" ")).toHaveLength(2);
  });
  it("keeps every period, five scores, missing and not-applicable values distinct", () => {
    render(<KpiHistoryTable points={historyFixture.points} granularity="WEEK" />);
    expect(screen.getAllByRole("row")).toHaveLength(13);
    expect(screen.getByRole("columnheader", { name: "Calidad" })).toBeInTheDocument();
    expect(screen.getAllByText("No aplica")).toHaveLength(11);
    expect(screen.getAllByText("Sin datos")).toHaveLength(6);
    expect(screen.getByText("0 / 1 · Parcial")).toBeInTheDocument();
  });
});
