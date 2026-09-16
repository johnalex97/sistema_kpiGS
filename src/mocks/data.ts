import {
  ClipboardList,
  ClipboardCheck,
  LayoutDashboard,
  RefreshCw,
  Users,
} from "lucide-react";
import type {
  NavigationItem,
  Work,
} from "../models/app";

// Fuente temporal exclusiva de la jornada visual de DashboardPage.
export const technicians = [
  { id: 1, name: "Carlos Méndez", initials: "CM", role: "Técnico senior", color: "#29b8aa", done: 7, goal: 8, score: 94, recurrence: 3, hours: "6h 40m" },
  { id: 2, name: "Ana López", initials: "AL", role: "Instalaciones", color: "#4776e6", done: 6, goal: 7, score: 91, recurrence: 2, hours: "6h 05m" },
  { id: 3, name: "Luis Romero", initials: "LR", role: "Soporte técnico", color: "#e9a23b", done: 5, goal: 7, score: 86, recurrence: 5, hours: "5h 30m" },
  { id: 4, name: "María Santos", initials: "MS", role: "Técnica de campo", color: "#8268d8", done: 4, goal: 6, score: 82, recurrence: 4, hours: "4h 55m" },
];

// Fuente temporal exclusiva de “Actividad reciente” en DashboardPage.
export const initialWorks: Work[] = [
  { id: "OT-1842", title: "Configuración de router empresarial", client: "Farmacia San Rafael", type: "Soporte", tech: "Carlos Méndez", time: "08:20", status: "Finalizado", duration: "1h 15m" },
  { id: "OT-1844", title: "Instalación de 4 cámaras IP", client: "Ferretería El Martillo", type: "Instalación", tech: "Ana López", time: "09:05", status: "En curso", duration: "2h 40m" },
  { id: "OT-1846", title: "Entrega y prueba de impresora", client: "Bufete Mendoza", type: "Entrega", tech: "María Santos", time: "10:10", status: "Finalizado", duration: "45m" },
  { id: "OT-1831", title: "Pérdida intermitente de conexión", client: "Café Central", type: "Soporte", tech: "Luis Romero", time: "11:35", status: "Pendiente", duration: "—", repeated: true },
  { id: "OT-1849", title: "Mantenimiento de punto de venta", client: "Supermercado La Colonia", type: "Soporte", tech: "Carlos Méndez", time: "13:15", status: "En curso", duration: "55m" },
];

export const navItems: NavigationItem[] = [
  { label: "Resumen", path: "/resumen", icon: LayoutDashboard },
  { label: "Órdenes", path: "/ordenes", icon: ClipboardCheck },
  { label: "Actividades", path: "/actividades", icon: ClipboardList },
  { label: "Técnicos", path: "/tecnicos", icon: Users },
  { label: "Reincidencias", path: "/reincidencias", icon: RefreshCw },
];
