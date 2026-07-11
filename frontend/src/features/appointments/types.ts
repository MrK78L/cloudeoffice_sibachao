export type Appointment = {
  id: string;
  officeId: string;
  customerName: string;
  email: string;
  phone?: string;
  scheduledAt: string;
  note?: string;
  adminNote?: string;
  status: "REQUESTED" | "CONFIRMED" | "COMPLETED" | "REJECTED" | "CANCELLED";
  createdAt?: string;
  updatedAt?: string;
};

export type CreateAppointmentInput = Pick<Appointment, "officeId" | "customerName" | "email" | "phone" | "scheduledAt" | "note">;
