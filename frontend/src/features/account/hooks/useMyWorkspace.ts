import { useEffect, useState } from "react";
import { toFriendlyMessage } from "../../../lib/friendlyErrors";
import type { Contract } from "../../admin/api/adminApi";
import type { RentalRequest } from "../../rental-requests";
import { getMyContracts, getMyRentalRequests } from "../api/accountApi";

export function useMyWorkspace() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [requests, setRequests] = useState<RentalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    Promise.all([getMyContracts(), getMyRentalRequests()])
      .then(([contractsResponse, requestsResponse]) => {
        if (!active) return;
        setContracts(contractsResponse.items);
        setRequests(requestsResponse.items);
      })
      .catch((caught) => {
        if (active) setError(toFriendlyMessage(caught, "Không thể tải dữ liệu tài khoản. Vui lòng thử lại."));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { contracts, requests, isLoading, error };
}
