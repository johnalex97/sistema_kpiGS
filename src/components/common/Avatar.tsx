import type { CSSProperties } from "react";

interface AvatarProps {
  initials: string;
  color: string;
  small?: boolean;
}

export function Avatar({ initials, color, small = false }: AvatarProps) {
  return (
    <span
      className={`avatar ${small ? "avatar--small" : ""}`}
      style={{ "--avatar-color": color } as CSSProperties}
      aria-label={`Iniciales ${initials}`}
    >
      {initials}
    </span>
  );
}
