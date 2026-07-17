import { useEffect, useState } from "react";
import { fallbackOffices, getOffices } from "../api/officesApi";
import type { Office, OfficeSearchParams } from "../types";

export function useOffices(params: OfficeSearchParams = {}) {
  const [items, setItems] = useState<Office[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    getOffices(params)
      .then((data) => {
        if (active) {
          setItems(data.items);
          setNextToken(data.nextToken);
        }
      })
      .catch((requestError) => {
        if (!active) return;
        const allowFallback = import.meta.env.DEV && import.meta.env.VITE_USE_DEMO_FALLBACK === "true";
        const query = params.q?.toLowerCase();
        setItems(allowFallback
          ? fallbackOffices.filter((office) => {
              const matchesQuery = !query || `${office.title} ${office.address}`.toLowerCase().includes(query);
              const matchesStatus = !params.status || office.status === params.status;
              return matchesQuery && matchesStatus;
            })
          : []);
        setError(requestError instanceof Error ? requestError.message : "Không thể tải danh sách văn phòng.");
        setNextToken(undefined);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [params.q, params.status]);

  async function loadMore() {
    if (!nextToken || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const data = await getOffices({ ...params, nextToken });
      setItems((current) => {
        const byId = new Map(current.map((office) => [office.id, office]));
        for (const office of data.items) byId.set(office.id, office);
        return [...byId.values()];
      });
      setNextToken(data.nextToken);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể tải thêm văn phòng.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  return { items, isLoading, isLoadingMore, hasMore: Boolean(nextToken), loadMore, error };
}
