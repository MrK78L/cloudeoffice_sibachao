import { useEffect, useState } from "react";
import { getOffice } from "../api/officesApi";
import type { Office } from "../types";

export function useOffice(id: string) {
  const [item, setItem] = useState<Office | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    setItem(null);

    getOffice(id)
      .then((response) => {
        if (active) setItem(response.item);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Không thể tải thông tin văn phòng.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  return { item, isLoading, error };
}
