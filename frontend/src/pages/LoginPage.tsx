import { LoginForm } from "../features/auth";

export function LoginPage({ reason }: { reason?: string }) {
  return (
    <main className="login-page">
      <LoginForm reason={reason} />
    </main>
  );
}
