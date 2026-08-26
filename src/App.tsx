import { AuthGate } from "./auth/AuthGate";
import { AuthProvider } from "./auth/AuthProvider";
import { AppShell } from "./layouts/AppShell";

export default function App() {
  return (
    <AuthProvider>
      <AuthGate><AppShell /></AuthGate>
    </AuthProvider>
  );
}
