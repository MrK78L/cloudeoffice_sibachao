import { useEffect, useState } from "react";

export function useAdminGlobalSearch() {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleSearch = (event: Event) => setQuery((event as CustomEvent<string>).detail ?? "");
    window.addEventListener("admin-global-search", handleSearch);
    return () => window.removeEventListener("admin-global-search", handleSearch);
  }, []);

  return query;
}
