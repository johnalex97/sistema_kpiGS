import { ArrowRight } from "lucide-react";

interface PanelTitleProps {
  eyebrow: string;
  title: string;
  action?: string;
}

export function PanelTitle({ eyebrow, title, action }: PanelTitleProps) {
  return (
    <div className="panel-title">
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action && (
        <button type="button">
          {action}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
