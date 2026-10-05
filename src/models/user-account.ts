export interface UserAccount {
  id: string;
  email: string;
  displayName: string;
  status: "ACTIVE" | "PENDING" | "INACTIVE" | "BLOCKED";
  mustChangePassword: boolean;
  roles: string[];
  tecnico: { id: string; fullName: string } | null;
  createdAt: string;
  version: number;
  failedLoginAttempts: number;
  lockedUntil: string | null;
}

export type UserRole = "ADMIN" | "SUPERVISOR" | "TECHNICIAN";

export interface UserAccountPage {
  items: UserAccount[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export interface CreateUserAccountInput {
  displayName: string;
  email: string;
  temporaryPassword: string;
}
