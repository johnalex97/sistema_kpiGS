import { Building2, ClipboardCheck, ClipboardList, LayoutDashboard, RefreshCw, Users } from "lucide-react";
import type { NavigationItem } from "../models/app";

export const navItems: NavigationItem[] = [
  { label: "Resumen", path: "/resumen", icon: LayoutDashboard },
  { label: "Órdenes", path: "/ordenes", icon: ClipboardCheck },
  { label: "Actividades", path: "/actividades", icon: ClipboardList },
  { label: "Técnicos", path: "/tecnicos", icon: Users },
  { label: "Reincidencias", path: "/reincidencias", icon: RefreshCw },
  { label: "Clientes", path: "/clientes", icon: Building2 },
];
