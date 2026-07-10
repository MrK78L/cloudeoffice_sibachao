export type RentalRequest = {
  id: string;
  officeId: string;
  customerName: string;
  email: string;
  message?: string;
  phone?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  decisionNote?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
};

export type CreateRentalRequestInput = Pick<RentalRequest, "officeId" | "customerName" | "email" | "phone" | "message">;
