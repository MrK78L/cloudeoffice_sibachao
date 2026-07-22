import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type Language = "vi" | "en";

type LanguageContextValue = {
  language: Language;
  locale: "vi-VN" | "en-US";
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  tr: (vietnamese: string, english: string) => string;
};

const storageKey = "orms.language";
const LanguageContext = createContext<LanguageContextValue | null>(null);

function getInitialLanguage(): Language {
  const stored = localStorage.getItem(storageKey);
  if (stored === "vi" || stored === "en") return stored;
  return navigator.language.toLowerCase().startsWith("vi") ? "vi" : "en";
}

export function getCurrentLanguage(): Language {
  if (typeof window === "undefined") return "vi";
  return localStorage.getItem(storageKey) === "en" ? "en" : "vi";
}

export function translate(vietnamese: string, english: string) {
  return getCurrentLanguage() === "vi" ? vietnamese : english;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    localStorage.setItem(storageKey, language);
    document.documentElement.lang = language;
    document.title = language === "vi" ? "Cloud Office | Quản lý thuê văn phòng" : "Cloud Office | Office leasing management";
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    locale: language === "vi" ? "vi-VN" : "en-US",
    setLanguage: setLanguageState,
    toggleLanguage: () => setLanguageState((current) => current === "vi" ? "en" : "vi"),
    tr: (vietnamese, english) => language === "vi" ? vietnamese : english
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}
