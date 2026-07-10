import { useEffect, useState } from "react";
import { toFriendlyMessage } from "../../../lib/friendlyErrors";

export function useAdminQuery<T>(loader: () => Promise<T>, dependencies: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    loader()
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((caught) => {
        if (active) setError(toFriendlyMessage(caught, "Không thể tải dữ liệu quản trị. Vui lòng thử lại."));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshIndex, ...dependencies]);

  return { data, isLoading, error, refetch: () => setRefreshIndex((value) => value + 1) };
}
