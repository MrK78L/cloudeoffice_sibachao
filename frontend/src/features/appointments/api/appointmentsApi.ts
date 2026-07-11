import { apiRequest } from "../../../lib/apiClient";
import type { Appointment, CreateAppointmentInput } from "../types";

export async function createAppointment(payload: CreateAppointmentInput) {
  return apiRequest<{ item: Appointment }>("/appointments", { method: "POST", body: payload, auth: true });
}

export async function getMyAppointments() {
  return apiRequest<{ items: Appointment[]; count: number }>("/me/appointments", { auth: true });
}

export async function cancelMyAppointment(id: string) {
  return apiRequest<{ item: Appointment }>(`/me/appointments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { status: "CANCELLED" },
    auth: true
  });
}
