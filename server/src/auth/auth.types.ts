export interface AuthConfig {
  sessionTtlMinutes: number;
  sessionIdleMinutes: number;
  maxFailedAttempts: number;
  lockMinutes: number;
}

export interface AuthRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
  technicianId: string | null;
  roles: string[];
  permissions: string[];
}

export interface AuthPrincipal extends PublicUser {
  userId: string;
  sessionId: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}
