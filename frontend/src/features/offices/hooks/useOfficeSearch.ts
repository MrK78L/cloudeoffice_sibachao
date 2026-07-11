import { FormEvent, useState } from "react";
import type { Office } from "../types";

export function useOfficeSearch(initialValue = "", initialStatus: Office["status"] | "ALL" = "ALL") {
  const [input, setInput] = useState(initialValue);
  const [query, setQuery] = useState(initialValue);
  const [status, setStatus] = useState<Office["status"] | "ALL">(initialStatus);

  function submit(event: FormEvent) {
    event.preventDefault();
    setQuery(input.trim());
  }

  function clear() {
    setInput("");
    setQuery("");
    setStatus("ALL");
  }

  return { input, setInput, query, status, setStatus, submit, clear };
}
