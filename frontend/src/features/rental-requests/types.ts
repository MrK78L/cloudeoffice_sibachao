export type RentalRequest = {
  id: string;
  officeId: string;
  customerName: string;
  email: string;
  message?: string;
  requestType?: "NEW_LEASE" | "RENEWAL";
  renewalContractId?: string;
  phone?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  decisionNote?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
};

export type CreateRentalRequestInput = Pick<RentalRequest, "officeId" | "customerName" | "phone" | "message">;
