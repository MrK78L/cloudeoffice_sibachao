import { useLanguage } from "./LanguageContext";

export function LanguageToggle() {
  const { language, setLanguage, tr } = useLanguage();

  return (
    <div className="language-toggle" aria-label={tr("Chọn ngôn ngữ", "Select language")} role="group">
      <button
        aria-pressed={language === "vi"}
        className={language === "vi" ? "active" : ""}
        onClick={() => setLanguage("vi")}
        title="Tiếng Việt"
        type="button"
      >
        VI
      </button>
      <button
        aria-pressed={language === "en"}
        className={language === "en" ? "active" : ""}
        onClick={() => setLanguage("en")}
        title="English"
        type="button"
      >
        EN
      </button>
    </div>
  );
}
