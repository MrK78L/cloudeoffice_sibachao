import { useState } from "react";
import { toFriendlyMessage } from "../../../lib/friendlyErrors";
import { createRentalRequest } from "../api/rentalRequestsApi";
import type { CreateRentalRequestInput, RentalRequest } from "../types";

export function useCreateRentalRequest() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mutate(payload: CreateRentalRequestInput): Promise<RentalRequest> {
    setIsPending(true);
    setError(null);
    try {
      const response = await createRentalRequest(payload);
      return response.item;
    } catch (requestError) {
      setError(toFriendlyMessage(requestError, "Không thể gửi yêu cầu thuê. Vui lòng thử lại."));
      throw requestError;
    } finally {
      setIsPending(false);
    }
  }

  return { mutate, isPending, error };
}
