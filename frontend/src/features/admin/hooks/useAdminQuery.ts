import { useEffect, useState } from "react";
import { toFriendlyMessage } from "../../../lib/friendlyErrors";
import { useLanguage } from "../../i18n";

export function useAdminQuery<T>(loader: () => Promise<T>, dependencies: unknown[] = []) {
  const { language, tr } = useLanguage();
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
        if (active) setError(toFriendlyMessage(caught, tr("Không thể tải dữ liệu quản trị. Vui lòng thử lại.", "Unable to load administration data. Please try again.")));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshIndex, language, ...dependencies]);

  return { data, isLoading, error, refetch: () => setRefreshIndex((value) => value + 1) };
}
