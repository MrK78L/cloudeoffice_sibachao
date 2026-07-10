import { FormEvent, useState } from "react";

export function useOfficeSearch(initialValue = "") {
  const [input, setInput] = useState(initialValue);
  const [query, setQuery] = useState(initialValue);

  function submit(event: FormEvent) {
    event.preventDefault();
    setQuery(input.trim());
  }

  return { input, setInput, query, submit };
}
