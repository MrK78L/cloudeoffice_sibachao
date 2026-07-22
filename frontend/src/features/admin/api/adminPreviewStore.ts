import type { Office } from "../../offices";
import type { RentalRequest } from "../../rental-requests";
import type { Appointment } from "../../appointments";
import type {
  AdminStats,
  AppointmentPayload,
  Contract,
  ContractPayload,
  Customer,
  CustomerPayload,
  OfficePayload,
  RentalRequestPayload
} from "./adminApi";

type PreviewData = {
  offices: Office[];
  rentalRequests: RentalRequest[];
  contracts: Contract[];
  customers: Customer[];
  appointments: Appointment[];
};

const storageKey = "cloudoffice.admin.preview.v1";
const now = "2026-07-11T08:00:00.000Z";

const initialData: PreviewData = {
  offices: [
    {
      id: "office-d1-1201",
      title: "Văn phòng cao cấp Quận 1",
      address: "Lê Thánh Tôn, Quận 1, TP.HCM",
      areaSqm: 120,
      monthlyPrice: 72000000,
      status: "AVAILABLE",
      buildingId: "central-plaza",
      buildingName: "Central Plaza",
      floor: 12,
      roomNumber: "1201",
      position: 1,
      imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=480&q=80",
      amenities: ["Lễ tân", "Phòng họp", "Internet tốc độ cao"],
      createdAt: now
    },
    {
      id: "office-tb-0302",
      title: "Văn phòng linh hoạt Tân Bình",
      address: "Cộng Hòa, Tân Bình, TP.HCM",
      areaSqm: 85,
      monthlyPrice: 39000000,
      status: "RESERVED",
      buildingId: "etown-office",
      buildingName: "Etown Office",
      floor: 3,
      roomNumber: "302",
      position: 1,
      imageUrl: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=480&q=80",
      amenities: ["Bãi xe", "Pantry", "An ninh 24/7"],
      createdAt: now
    },
    {
      id: "office-tp-0805",
      title: "Không gian làm việc Thủ Đức",
      address: "Xa lộ Hà Nội, TP. Thủ Đức",
      areaSqm: 160,
      monthlyPrice: 89000000,
      status: "LEASED",
      buildingId: "metro-business-hub",
      buildingName: "Metro Business Hub",
      floor: 8,
      roomNumber: "805",
      position: 1,
      imageUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=480&q=80",
      amenities: ["Sảnh chờ", "Phòng họp lớn", "Điều hòa trung tâm"],
      createdAt: now
    }
  ],
  rentalRequests: [
    {
      id: "request-1001",
      officeId: "office-d1-1201",
      customerName: "Nguyễn Minh Anh",
      email: "minhanh@example.com",
      phone: "0901234567",
      message: "Cần khảo sát văn phòng trong tuần này.",
      status: "PENDING",
      createdAt: now
    },
    {
      id: "request-1002",
      officeId: "office-tb-0302",
      customerName: "Trần Quốc Huy",
      email: "quochuy@example.com",
      phone: "0912345678",
      status: "APPROVED",
      createdAt: now
    }
  ],
  contracts: [
    {
      id: "contract-2026-001",
      officeId: "office-tp-0805",
      customerId: "quochuy@example.com",
      title: "Hợp đồng thuê văn phòng Thủ Đức",
      status: "ACTIVE",
      startDate: "2026-06-01",
      endDate: "2027-05-31",
      monthlyPrice: 89000000,
      createdAt: now
    }
  ],
  customers: [
    { id: "customer-001", name: "Nguyễn Minh Anh", email: "minhanh@example.com", phone: "0901234567", status: "ACTIVE", createdAt: now },
    { id: "customer-002", name: "Công ty TNHH Quốc Huy", email: "quochuy@example.com", phone: "0912345678", status: "ACTIVE", createdAt: now },
    { id: "customer-003", name: "Lê Hoàng Nam", email: "hoangnam@example.com", phone: "0987654321", status: "INACTIVE", createdAt: now }
  ],
  appointments: [
    {
      id: "appointment-1001",
      officeId: "office-d1-1201",
      customerName: "Nguyễn Minh Anh",
      email: "minhanh@example.com",
      phone: "0901234567",
      scheduledAt: "2026-08-15T03:00:00.000Z",
      note: "Muốn xem phòng họp và khu làm việc.",
      status: "REQUESTED",
      createdAt: now
    }
  ]
};

export const isAdminPreviewMode = import.meta.env.DEV && import.meta.env.VITE_BYPASS_ADMIN_AUTH === "true";

function cloneInitialData(): PreviewData {
  return JSON.parse(JSON.stringify(initialData)) as PreviewData;
}

function readData(): PreviewData {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    const data = cloneInitialData();
    writeData(data);
    return data;
  }

  try {
    const data = JSON.parse(raw) as PreviewData;
    if (!Array.isArray(data.appointments)) {
      data.appointments = cloneInitialData().appointments;
      writeData(data);
    }
    const fallbackLocations = cloneInitialData().offices;
    let changed = false;
    data.offices = data.offices.map((office, index) => {
      if (office.buildingId) return office;
      changed = true;
      const fallback = fallbackLocations[index % fallbackLocations.length];
      return {
        ...office,
        buildingId: fallback.buildingId,
        buildingName: fallback.buildingName,
        floor: fallback.floor,
        roomNumber: office.id.split("-").slice(-1)[0] ?? fallback.roomNumber,
        position: index + 1
      };
    });
    if (changed) writeData(data);
    return data;
  } catch {
    const data = cloneInitialData();
    writeData(data);
    return data;
  }
}

function writeData(data: PreviewData) {
  localStorage.setItem(storageKey, JSON.stringify(data));
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return Date.parse(startA) < Date.parse(endB) && Date.parse(startB) < Date.parse(endA);
}

function appointmentEnd(scheduledAt: string) {
  return new Date(Date.parse(scheduledAt) + 30 * 60_000).toISOString();
}

function assertPreviewAppointmentAvailable(data: PreviewData, officeId: string, scheduledAt: string) {
  const conflict = data.contracts.some((contract) => contract.officeId === officeId && ["PENDING_SIGNATURE", "ACTIVE"].includes(contract.status) && contract.startDate && contract.endDate && overlaps(scheduledAt, appointmentEnd(scheduledAt), contract.startDate, contract.endDate));
  if (conflict) throw new Error("Thời gian này nằm trong thời hạn văn phòng đã được ký thuê. Vui lòng chọn lịch khác.");
}

function assertPreviewContractAvailable(data: PreviewData, contract: Contract, excludedId = "") {
  if (!["PENDING_SIGNATURE", "ACTIVE"].includes(contract.status) || !contract.startDate || !contract.endDate) return;
  const contractConflict = data.contracts.some((item) => item.id !== excludedId && item.officeId === contract.officeId && ["PENDING_SIGNATURE", "ACTIVE"].includes(item.status) && item.startDate && item.endDate && overlaps(contract.startDate!, contract.endDate!, item.startDate, item.endDate));
  if (contractConflict) throw new Error("Khoảng thời gian này trùng với một hợp đồng khác của văn phòng.");
  const appointmentConflict = data.appointments.some((item) => item.officeId === contract.officeId && ["REQUESTED", "CONFIRMED"].includes(item.status) && overlaps(item.scheduledAt, appointmentEnd(item.scheduledAt), contract.startDate!, contract.endDate!));
  if (appointmentConflict) throw new Error("Hợp đồng trùng với lịch xem văn phòng đang được xử lý.");
}

function applyPreviewContractActivation(data: PreviewData, contract: Contract) {
  data.offices = data.offices.map((office) => office.id === contract.officeId ? { ...office, status: "LEASED" } : office);
  data.rentalRequests = data.rentalRequests.map((request) => {
    if (request.id === contract.rentalRequestId) return { ...request, status: "APPROVED", updatedAt: new Date().toISOString() };
    if (request.officeId === contract.officeId && ["PENDING", "APPROVED"].includes(request.status)) {
      return { ...request, status: "REJECTED", decisionNote: "Văn phòng đã được ký hợp đồng với khách hàng khác.", updatedAt: new Date().toISOString() };
    }
    return request;
  });
}

export function getPreviewStats(): AdminStats {
  const data = readData();
  const activeOffices = data.offices.filter((item) => item.status !== "INACTIVE");
  const activeContracts = data.contracts.filter((item) => item.status === "ACTIVE");
  const nowTime = Date.now();
  const warningEnd = nowTime + (30 * 24 * 60 * 60 * 1000);
  return {
    offices: activeOffices.length,
    pendingRentalRequests: data.rentalRequests.filter((item) => item.status === "PENDING").length,
    activeContracts: activeContracts.length,
    customers: data.customers.filter((item) => item.status !== "INACTIVE").length,
    pendingAppointments: data.appointments.filter((item) => item.status === "REQUESTED").length,
    occupancyRate: activeOffices.length ? Math.round((activeContracts.length / activeOffices.length) * 100) : 0,
    expiringContracts: activeContracts.filter((item) => item.endDate && Date.parse(item.endDate) >= nowTime && Date.parse(item.endDate) <= warningEnd),
    todayAppointments: data.appointments.filter((item) => item.scheduledAt.slice(0, 10) === new Date().toISOString().slice(0, 10) && ["REQUESTED", "CONFIRMED"].includes(item.status)),
    officeStatusCounts: Object.fromEntries(["AVAILABLE", "RESERVED", "LEASED", "INACTIVE"].map((status) => [status, data.offices.filter((item) => item.status === status).length])) as Record<Office["status"], number>,
    requestStatusCounts: Object.fromEntries(["PENDING", "APPROVED", "REJECTED", "CANCELLED"].map((status) => [status, data.rentalRequests.filter((item) => item.status === status).length])) as Record<RentalRequest["status"], number>
  };
}

export const getPreviewOffices = () => readData().offices;
export const getPreviewRentalRequests = () => readData().rentalRequests;
export const getPreviewContracts = () => readData().contracts;
export const getPreviewCustomers = () => readData().customers;
export const getPreviewAppointments = () => readData().appointments ?? [];

export function createPreviewAppointment(payload: AppointmentPayload) {
  const data = readData();
  data.appointments ??= [];
  assertPreviewAppointmentAvailable(data, payload.officeId, payload.scheduledAt);
  const item: Appointment = {
    id: createId("appointment"),
    ...payload,
    status: "REQUESTED",
    createdAt: new Date().toISOString()
  };
  data.appointments.unshift(item);
  writeData(data);
  return item;
}

export function updatePreviewAppointment(id: string, payload: { status?: Appointment["status"]; scheduledAt?: string; adminNote?: string }) {
  const data = readData();
  data.appointments ??= [];
  const index = data.appointments.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Không tìm thấy lịch hẹn.");
  const item = { ...data.appointments[index], ...payload, updatedAt: new Date().toISOString() };
  if (["REQUESTED", "CONFIRMED"].includes(item.status)) assertPreviewAppointmentAvailable(data, item.officeId, item.scheduledAt);
  data.appointments[index] = item;
  writeData(data);
  return item;
}

export function deletePreviewAppointment(id: string) {
  const data = readData();
  data.appointments ??= [];
  const item = data.appointments.find((appointment) => appointment.id === id);
  if (!item) throw new Error("Không tìm thấy lịch hẹn.");
  data.appointments = data.appointments.filter((appointment) => appointment.id !== id);
  writeData(data);
  return item;
}

export function createPreviewOffice(payload: OfficePayload) {
  const data = readData();
  const item: Office = { id: createId("office"), ...payload, createdAt: new Date().toISOString() };
  data.offices.unshift(item);
  writeData(data);
  return item;
}

export function updatePreviewOffice(id: string, payload: Partial<OfficePayload>) {
  const data = readData();
  const index = data.offices.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Không tìm thấy văn phòng cần cập nhật.");
  const current = data.offices[index];
  const nextPayload = payload.imageUrl === "" && current.imageUrl?.startsWith("data:")
    ? { ...payload, imageUrl: current.imageUrl }
    : payload;
  const item = { ...current, ...nextPayload, updatedAt: new Date().toISOString() };
  data.offices[index] = item;
  writeData(data);
  return item;
}

export function deletePreviewOffice(id: string) {
  const data = readData();
  const item = data.offices.find((office) => office.id === id);
  if (!item) throw new Error("Không tìm thấy văn phòng cần xóa.");
  if (data.contracts.some((contract) => contract.officeId === id && contract.status === "ACTIVE")) {
    throw new Error("Văn phòng đang có hợp đồng hiệu lực nên chưa thể xóa.");
  }
  data.offices = data.offices.filter((office) => office.id !== id);
  writeData(data);
  return item;
}

export function createPreviewRentalRequest(payload: RentalRequestPayload) {
  const data = readData();
  const item: RentalRequest = { id: createId("request"), ...payload, status: "PENDING", createdAt: new Date().toISOString() };
  data.rentalRequests.unshift(item);
  writeData(data);
  return item;
}

export function updatePreviewRentalRequest(id: string, payload: Pick<RentalRequest, "status"> & { decisionNote?: string }) {
  const data = readData();
  const index = data.rentalRequests.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Không tìm thấy yêu cầu thuê.");
  const item = { ...data.rentalRequests[index], ...payload, updatedAt: new Date().toISOString() };
  data.rentalRequests[index] = item;
  writeData(data);
  return item;
}

export function deletePreviewRentalRequest(id: string) {
  const data = readData();
  const item = data.rentalRequests.find((request) => request.id === id);
  if (!item) throw new Error("Không tìm thấy yêu cầu thuê.");
  data.rentalRequests = data.rentalRequests.filter((request) => request.id !== id);
  writeData(data);
  return item;
}

export function createPreviewContract(payload: ContractPayload) {
  const data = readData();
  const item: Contract = { id: createId("contract"), ...payload, createdAt: new Date().toISOString() };
  assertPreviewContractAvailable(data, item);
  data.contracts.unshift(item);
  if (item.status === "ACTIVE") applyPreviewContractActivation(data, item);
  writeData(data);
  return item;
}

export function updatePreviewContract(id: string, payload: Partial<ContractPayload>) {
  const data = readData();
  const index = data.contracts.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Không tìm thấy hợp đồng.");
  const current = data.contracts[index];
  const updatedAt = new Date().toISOString();
  const isEnding = current.status === "ACTIVE" && ["EXPIRED", "TERMINATED"].includes(payload.status ?? "");
  const isRenewing = ["EXPIRED", "TERMINATED"].includes(current.status) && payload.status === "ACTIVE";
  if (isRenewing && (!current.renewalDeadline || Date.now() > Date.parse(current.renewalDeadline))) {
    throw new Error("Thời hạn gia hạn 3 ngày đã kết thúc. Vui lòng tạo hợp đồng mới.");
  }
  if (isRenewing) {
    const renewalRequest = data.rentalRequests.find((request) => request.id === payload.rentalRequestId && request.requestType === "RENEWAL" && request.renewalContractId === current.id && request.status === "APPROVED");
    if (!renewalRequest) throw new Error("Yêu cầu gia hạn phải được khách hàng gửi và được duyệt trước.");
  }
  const item: Contract = {
    ...current,
    ...payload,
    ...(isEnding ? { endedAt: updatedAt, renewalDeadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), rentalRequestId: undefined } : {}),
    ...(isRenewing ? { renewedAt: updatedAt, renewalDeadline: undefined } : {}),
    updatedAt
  };
  assertPreviewContractAvailable(data, item, current.id);
  data.contracts[index] = item;
  if (isEnding) {
    data.offices = data.offices.map((office) => office.id === current.officeId ? { ...office, status: "AVAILABLE" } : office);
    if (current.rentalRequestId) data.rentalRequests = data.rentalRequests.filter((request) => request.id !== current.rentalRequestId);
  }
  if (isRenewing) {
    applyPreviewContractActivation(data, item);
  }
  writeData(data);
  return item;
}

export function deletePreviewContract(id: string) {
  const data = readData();
  const item = data.contracts.find((contract) => contract.id === id);
  if (!item) throw new Error("Không tìm thấy hợp đồng.");
  if (["ACTIVE", "PENDING_SIGNATURE"].includes(item.status)) {
    throw new Error("Hợp đồng đang hiệu lực hoặc chờ ký nên chưa thể xóa.");
  }
  if (!["EXPIRED", "TERMINATED"].includes(item.status)) throw new Error("Chỉ có thể xóa hợp đồng đã kết thúc.");
  if (!item.renewalDeadline || Date.now() < Date.parse(item.renewalDeadline)) {
    throw new Error("Hợp đồng đang trong thời gian chờ gia hạn 3 ngày nên chưa thể xóa.");
  }
  data.contracts = data.contracts.filter((contract) => contract.id !== id);
  writeData(data);
  return item;
}

export function createPreviewCustomer(payload: CustomerPayload) {
  const data = readData();
  const item: Customer = { id: createId("customer"), ...payload, createdAt: new Date().toISOString() };
  data.customers.unshift(item);
  writeData(data);
  return item;
}

export function updatePreviewCustomer(id: string, payload: Partial<Omit<CustomerPayload, "email">>) {
  const data = readData();
  const index = data.customers.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Không tìm thấy khách hàng.");
  const item = { ...data.customers[index], ...payload, updatedAt: new Date().toISOString() };
  data.customers[index] = item;
  writeData(data);
  return item;
}

export function deletePreviewCustomer(id: string) {
  const data = readData();
  const item = data.customers.find((customer) => customer.id === id);
  if (!item) throw new Error("Không tìm thấy khách hàng.");
  if (data.contracts.some((contract) => contract.customerId === id && contract.status === "ACTIVE")) {
    throw new Error("Khách hàng đang có hợp đồng hiệu lực nên chưa thể xóa.");
  }
  data.customers = data.customers.filter((customer) => customer.id !== id);
  writeData(data);
  return item;
}

export async function uploadPreviewOfficeImage(id: string, file: File) {
  const imageUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không thể đọc ảnh đã chọn."));
    reader.readAsDataURL(file);
  });
  updatePreviewOffice(id, { imageUrl });
}
