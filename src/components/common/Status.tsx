import type { WorkStatus } from "../../models/app";

export function Status({ value }: { value: WorkStatus }) {
  return (
    <span className={`status status--${value.toLowerCase().replace(" ", "-")}`}>
      <i aria-hidden="true" />
      {value}
    </span>
  );
}
