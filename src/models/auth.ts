export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
  technicianId: string | null;
  roles: string[];
  permissions: string[];
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}
