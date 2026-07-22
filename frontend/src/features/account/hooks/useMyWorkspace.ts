import { useCallback, useEffect, useState } from "react";
import { toFriendlyMessage } from "../../../lib/friendlyErrors";
import type { Contract } from "../../admin/api/adminApi";
import type { RentalRequest } from "../../rental-requests";
import { getMyContracts, getMyRentalRequests } from "../api/accountApi";
import { useLanguage } from "../../i18n";
import { getOffices } from "../../offices/api/officesApi";
import type { Office } from "../../offices";

export function useMyWorkspace() {
  const { language, tr } = useLanguage();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [requests, setRequests] = useState<RentalRequest[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    Promise.all([getMyContracts(), getMyRentalRequests(), getOffices({ limit: 200 }).catch(() => ({ items: [] }))])
      .then(([contractsResponse, requestsResponse, officesResponse]) => {
        if (!active) return;
        setContracts(contractsResponse.items);
        setRequests(requestsResponse.items);
        setOffices(officesResponse.items);
      })
      .catch((caught) => {
        if (active) setError(toFriendlyMessage(caught, tr("Không thể tải dữ liệu tài khoản. Vui lòng thử lại.", "Unable to load account data. Please try again.")));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [language, tr]);

  useEffect(() => loadWorkspace(), [loadWorkspace]);

  return { contracts, requests, offices, isLoading, error, refetch: loadWorkspace };
}
