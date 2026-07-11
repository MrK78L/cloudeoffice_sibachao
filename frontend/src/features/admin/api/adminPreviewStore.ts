import type { Office } from "../../offices";
import type { RentalRequest } from "../../rental-requests";
import type { Appointment } from "../../appointments";
import type {
  AdminStats,
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
      customerId: "customer-002",
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

export function getPreviewStats(): AdminStats {
  const data = readData();
  return {
    offices: data.offices.length,
    pendingRentalRequests: data.rentalRequests.filter((item) => item.status === "PENDING").length,
    activeContracts: data.contracts.filter((item) => item.status === "ACTIVE").length,
    customers: data.customers.length
  };
}

export const getPreviewOffices = () => readData().offices;
export const getPreviewRentalRequests = () => readData().rentalRequests;
export const getPreviewContracts = () => readData().contracts;
export const getPreviewCustomers = () => readData().customers;
export const getPreviewAppointments = () => readData().appointments ?? [];

export function updatePreviewAppointment(id: string, payload: Pick<Appointment, "status"> & { adminNote?: string }) {
  const data = readData();
  data.appointments ??= [];
  const index = data.appointments.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Không tìm thấy lịch hẹn.");
  const item = { ...data.appointments[index], ...payload, updatedAt: new Date().toISOString() };
  data.appointments[index] = item;
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
  data.contracts.unshift(item);
  writeData(data);
  return item;
}

export function updatePreviewContract(id: string, payload: Partial<ContractPayload>) {
  const data = readData();
  const index = data.contracts.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Không tìm thấy hợp đồng.");
  const item = { ...data.contracts[index], ...payload, updatedAt: new Date().toISOString() };
  data.contracts[index] = item;
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
