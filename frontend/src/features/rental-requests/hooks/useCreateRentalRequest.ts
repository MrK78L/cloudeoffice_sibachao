import { useState } from "react";
import { toFriendlyMessage } from "../../../lib/friendlyErrors";
import { createRentalRequest } from "../api/rentalRequestsApi";
import type { CreateRentalRequestInput, RentalRequest } from "../types";
import { useLanguage } from "../../i18n";

export function useCreateRentalRequest() {
  const { tr } = useLanguage();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mutate(payload: CreateRentalRequestInput): Promise<RentalRequest> {
    setIsPending(true);
    setError(null);
    try {
      const response = await createRentalRequest(payload);
      return response.item;
    } catch (requestError) {
      setError(toFriendlyMessage(requestError, tr("Không thể gửi yêu cầu thuê. Vui lòng thử lại.", "Unable to submit the leasing request. Please try again.")));
      throw requestError;
    } finally {
      setIsPending(false);
    }
  }

  return { mutate, isPending, error };
}
