import { ReactNode } from "react";
import { AuthProvider } from "../features/auth";
import { LanguageProvider } from "../features/i18n";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <LanguageProvider>
      <AuthProvider>{children}</AuthProvider>
    </LanguageProvider>
  );
}
