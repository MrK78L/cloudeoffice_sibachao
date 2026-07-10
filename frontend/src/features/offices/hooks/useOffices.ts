import { useEffect, useState } from "react";
import { fallbackOffices, getOffices } from "../api/officesApi";
import type { Office, OfficeSearchParams } from "../types";

export function useOffices(params: OfficeSearchParams = {}) {
  const [items, setItems] = useState<Office[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    getOffices(params)
      .then((data) => {
        if (active) setItems(data.items);
      })
      .catch((requestError) => {
        if (!active) return;
        const allowFallback = import.meta.env.DEV && import.meta.env.VITE_USE_DEMO_FALLBACK === "true";
        const query = params.q?.toLowerCase();
        setItems(allowFallback
          ? query
            ? fallbackOffices.filter((office) => `${office.title} ${office.address}`.toLowerCase().includes(query))
            : fallbackOffices
          : []);
        setError(requestError instanceof Error ? requestError.message : "Không thể tải danh sách văn phòng.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [params.q, params.status]);

  return { items, isLoading, error };
}
