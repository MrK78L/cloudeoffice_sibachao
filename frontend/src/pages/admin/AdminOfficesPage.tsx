import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  createAdminOffice,
  createAdminOfficeImageUploadUrl,
  confirmAdminOfficeImage,
  deleteAdminOffice,
  getAdminOffices,
  type OfficePayload,
  updateAdminOffice,
  uploadOfficeImageToS3
} from "../../features/admin/api/adminApi";
import { useAdminQuery } from "../../features/admin/hooks/useAdminQuery";
import { DataTable, type DataTableColumn } from "../../features/admin/shared/components/DataTable";
import { Drawer } from "../../features/admin/shared/components/Drawer";
import { useAdminGlobalSearch } from "../../features/admin/hooks/useAdminGlobalSearch";
import type { Office } from "../../features/offices";
import { toFriendlyMessage } from "../../lib/friendlyErrors";
import { formatCurrency, formatStatus } from "../../shared/utils/format";
import { useLanguage } from "../../features/i18n";

type OfficeForm = {
  id?: string;
  title: string;
  address: string;
  areaSqm: string;
  monthlyPrice: string;
  status: Office["status"];
  description: string;
  externalImageUrl: string;
  amenities: string;
  buildingId: string;
  buildingName: string;
  floor: string;
  roomNumber: string;
  position: string;
};

const emptyForm: OfficeForm = {
  title: "",
  address: "",
  areaSqm: "",
  monthlyPrice: "",
  status: "AVAILABLE",
  description: "",
  externalImageUrl: "",
  amenities: "",
  buildingId: "",
  buildingName: "",
  floor: "",
  roomNumber: "",
  position: "0"
};

export function AdminOfficesPage() {
  const { language, tr } = useLanguage();
  const { data, isLoading, error, refetch } = useAdminQuery(getAdminOffices, []);
  const [form, setForm] = useState<OfficeForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [lastRemovedOffice, setLastRemovedOffice] = useState<Office | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "floor">("table");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Office["status"]>("ALL");
  const [buildingFilter, setBuildingFilter] = useState("ALL");
  const [floorFilter, setFloorFilter] = useState("ALL");
  const globalSearch = useAdminGlobalSearch();
  const items = data?.items ?? [];
  const buildings = useMemo(() => [...new Map(items.filter((item) => item.buildingId).map((item) => [item.buildingId!, item.buildingName || item.buildingId!])).entries()], [items]);
  const floors = useMemo(() => [...new Set(items.filter((item) => buildingFilter === "ALL" || item.buildingId === buildingFilter).map((item) => item.floor).filter((value): value is number => value !== undefined))].sort((a, b) => a - b), [buildingFilter, items]);
  const filteredItems = useMemo(() => {
    const query = globalSearch.toLowerCase();
    return items.filter((office) =>
      (statusFilter === "ALL" || office.status === statusFilter) &&
      (buildingFilter === "ALL" || office.buildingId === buildingFilter) &&
      (floorFilter === "ALL" || office.floor === Number(floorFilter)) &&
      (!query || `${office.title} ${office.address} ${office.buildingName ?? ""} ${office.roomNumber ?? ""}`.toLowerCase().includes(query))
    );
  }, [buildingFilter, floorFilter, globalSearch, items, statusFilter]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const resetForm = () => {
    setForm(emptyForm);
    setLastRemovedOffice(null);
    setImageFile(null);
    setCurrentImageUrl("");
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl("");
    setIsFormOpen(false);
  };

  const editOffice = (office: Office) => {
    setForm({
      id: office.id,
      title: office.title,
      address: office.address,
      areaSqm: String(office.areaSqm),
      monthlyPrice: String(office.monthlyPrice),
      status: office.status,
      description: office.description ?? "",
      externalImageUrl: office.externalImageUrl ?? (!office.imageKey ? office.imageUrl ?? "" : ""),
      amenities: office.amenities?.join(", ") ?? "",
      buildingId: office.buildingId ?? "",
      buildingName: office.buildingName ?? "",
      floor: office.floor === undefined ? "" : String(office.floor),
      roomNumber: office.roomNumber ?? "",
      position: String(office.position ?? 0)
    });
    setImageFile(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl("");
    setCurrentImageUrl(office.imageUrl ?? "");
    setActionError(null);
    setActionSuccess(null);
    setIsFormOpen(true);
  };

  const handleImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);

    if (!file) {
      setImageFile(null);
      setImagePreviewUrl("");
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setActionError(tr("Ảnh văn phòng phải có định dạng JPG, PNG hoặc WebP.", "Office images must be JPG, PNG or WebP."));
      event.target.value = "";
      return;
    }

    setActionError(null);
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    event.target.value = "";
  };

  const toPayload = (): OfficePayload => ({
    title: form.title.trim(),
    address: form.address.trim(),
    areaSqm: Number(form.areaSqm),
    monthlyPrice: Number(form.monthlyPrice),
    status: form.status,
    description: form.description.trim(),
    imageUrl: form.externalImageUrl.trim(),
    amenities: form.amenities.split(",").map((item) => item.trim()).filter(Boolean),
    buildingId: form.buildingId.trim(),
    buildingName: form.buildingName.trim(),
    floor: form.floor === "" ? undefined : Number(form.floor),
    roomNumber: form.roomNumber.trim(),
    position: Number(form.position || 0)
  });

  const uploadAndAttachImage = async (officeId: string, file: File) => {
    const upload = await createAdminOfficeImageUploadUrl(officeId, file);
    await uploadOfficeImageToS3(upload.uploadUrl, file);
    await confirmAdminOfficeImage(officeId, upload.key);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const response = form.id
        ? await updateAdminOffice(form.id, toPayload())
        : await createAdminOffice(toPayload());

      if (imageFile) {
        await uploadAndAttachImage(response.item.id, imageFile);
      }

      setActionSuccess(form.id ? tr("Đã cập nhật văn phòng.", "Office updated.") : tr("Đã tạo văn phòng mới.", "Office created."));
      resetForm();
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (office: Office) => {
    if (!window.confirm(tr(
      `Xóa văn phòng "${office.title}"? Hệ thống sẽ chặn nếu còn hợp đồng hoặc yêu cầu thuê liên quan.`,
      `Remove office "${office.title}"? The system will block this action if related contracts or requests still exist.`
    ))) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      await deleteAdminOffice(office.id);
      setActionSuccess(tr("Đã ngừng hoạt động văn phòng.", "Office marked as inactive."));
      setLastRemovedOffice(office);
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    }
  };

  const undoRemove = async () => {
    if (!lastRemovedOffice) return;
    setActionError(null);
    try {
      await updateAdminOffice(lastRemovedOffice.id, { status: "AVAILABLE" });
      setActionSuccess(tr("Đã khôi phục văn phòng.", "Office restored."));
      setLastRemovedOffice(null);
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    }
  };

  const columns: DataTableColumn<Office>[] = [
    {
      key: "image",
      header: tr("Ảnh", "Image"),
      render: (row) => (
        <span className="admin-office-thumb">
          {row.imageUrl ? <img alt="" src={row.imageUrl} /> : <span>OR</span>}
        </span>
      )
    },
    { key: "title", header: tr("Tên văn phòng", "Office name"), render: (row) => row.title },
    { key: "location", header: tr("Vị trí", "Location"), render: (row) => row.buildingName ? `${row.buildingName} · ${tr("Tầng", "Floor")} ${row.floor} · ${row.roomNumber}` : tr("Chưa phân vị trí", "Unassigned") },
    { key: "address", header: tr("Địa chỉ", "Address"), render: (row) => row.address },
    { key: "area", header: tr("Diện tích", "Area"), render: (row) => `${row.areaSqm} m2` },
    { key: "price", header: tr("Giá thuê", "Rent"), render: (row) => formatCurrency(row.monthlyPrice, language) },
    { key: "status", header: tr("Trạng thái", "Status"), render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{formatStatus(row.status, language)}</span> },
    {
      key: "actions",
      header: tr("Thao tác", "Actions"),
      render: (row) => (
        <div className="admin-row-actions">
          <button onClick={() => editOffice(row)} type="button">{tr("Sửa", "Edit")}</button>
          <button className="danger-action" onClick={() => void handleDelete(row)} type="button">{tr("Xóa", "Remove")}</button>
        </div>
      )
    }
  ];

  const previewUrl = imagePreviewUrl || currentImageUrl || form.externalImageUrl;
  const floorGroups = useMemo(() => {
    const groups = new Map<string, Office[]>();
    for (const office of filteredItems) {
      const key = office.buildingName && office.floor !== undefined
        ? `${office.buildingName}|${office.floor}`
        : `${tr("Chưa phân vị trí", "Unassigned")}|-`;
      groups.set(key, [...(groups.get(key) ?? []), office]);
    }
    return [...groups.entries()].map(([key, offices]) => ({
      key,
      building: key.split("|")[0],
      floor: key.split("|")[1],
      offices: offices.sort((left, right) => (left.position ?? 0) - (right.position ?? 0) || (left.roomNumber ?? "").localeCompare(right.roomNumber ?? ""))
    }));
  }, [filteredItems, tr]);

  return (
    <section className="admin-page">
      <div className="admin-page-title admin-page-title-row">
        <div>
          <p className="eyebrow">{tr("Quản lý", "Management")}</p>
          <h1>{tr("Văn phòng", "Offices")}</h1>
        </div>
        <button className="admin-primary-action" onClick={() => { resetForm(); setIsFormOpen(true); }} type="button">
          {tr("Thêm văn phòng", "Add office")}
        </button>
      </div>

      {error && <div className="notice danger">{error}</div>}
      {actionError && <div className="notice danger">{actionError}</div>}
      {actionSuccess && <div className="notice success admin-undo-notice"><span>{actionSuccess}</span>{lastRemovedOffice && <button onClick={() => void undoRemove()} type="button">{tr("Hoàn tác", "Undo")}</button>}</div>}

      <div className="admin-filter-bar admin-office-toolbar">
        <div className="admin-segmented-control" aria-label={tr("Kiểu hiển thị", "View mode")}>
          <button className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")} type="button">{tr("Danh sách", "List")}</button>
          <button className={viewMode === "floor" ? "active" : ""} onClick={() => setViewMode("floor")} type="button">{tr("Sơ đồ tầng", "Floor plan")}</button>
        </div>
        <label>{tr("Tòa nhà", "Building")}
          <select onChange={(event) => { setBuildingFilter(event.target.value); setFloorFilter("ALL"); }} value={buildingFilter}>
            <option value="ALL">{tr("Tất cả tòa nhà", "All buildings")}</option>
            {buildings.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label>{tr("Tầng", "Floor")}
          <select onChange={(event) => setFloorFilter(event.target.value)} value={floorFilter}>
            <option value="ALL">{tr("Tất cả tầng", "All floors")}</option>
            {floors.map((floor) => <option key={floor} value={floor}>{floor}</option>)}
          </select>
        </label>
        <label>{tr("Trạng thái", "Status")}
          <select onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} value={statusFilter}>
            <option value="ALL">{tr("Tất cả", "All")}</option>
            <option value="AVAILABLE">{formatStatus("AVAILABLE", language)}</option>
            <option value="RESERVED">{formatStatus("RESERVED", language)}</option>
            <option value="LEASED">{formatStatus("LEASED", language)}</option>
            <option value="INACTIVE">{formatStatus("INACTIVE", language)}</option>
          </select>
        </label>
        <span className="admin-filter-count">{filteredItems.length} {tr("văn phòng", "offices")}</span>
      </div>

      <Drawer
        description={tr("Thông tin vị trí được dùng để tạo sơ đồ tòa nhà và ngăn trùng số phòng.", "Location data builds the floor plan and prevents duplicate rooms.")}
        onClose={resetForm}
        open={isFormOpen}
        title={form.id ? tr("Chỉnh sửa văn phòng", "Edit office") : tr("Thêm văn phòng", "Add office")}
        wide
      >
        <form className="admin-drawer-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="admin-office-image-field">
            <div className="admin-office-image-preview">
              {previewUrl ? <img alt="" src={previewUrl} /> : <span>{tr("Chưa có ảnh", "No image")}</span>}
            </div>
            <div>
              <label className="admin-upload-button">
                {tr("Chọn ảnh từ máy", "Choose image")}
                <input accept="image/jpeg,image/png,image/webp" onChange={handleImageFileChange} type="file" />
              </label>
              <p className="muted">{tr("Ảnh sẽ được upload vào S3 private. Lambda xử lý ảnh sẽ tạo bản WebP tối ưu sau khi upload.", "The image is uploaded to private S3 storage. Lambda creates an optimized WebP version after upload.")}</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              {tr("Tên văn phòng", "Office name")}
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
            </label>
            <label>
              {tr("Trạng thái", "Status")}
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Office["status"] })}>
                <option value="AVAILABLE">{formatStatus("AVAILABLE", language)}</option>
                <option value="RESERVED">{formatStatus("RESERVED", language)}</option>
                <option value="LEASED">{formatStatus("LEASED", language)}</option>
                <option value="INACTIVE">{formatStatus("INACTIVE", language)}</option>
              </select>
            </label>
            <label>
              {tr("Địa chỉ", "Address")}
              <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} required />
            </label>
            <label>
              {tr("Tên tòa nhà", "Building name")}
              <input value={form.buildingName} onChange={(event) => setForm({ ...form, buildingName: event.target.value })} required />
            </label>
            <label>
              {tr("Mã tòa nhà", "Building ID")}
              <input value={form.buildingId} onChange={(event) => setForm({ ...form, buildingId: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} placeholder="central-plaza" required />
            </label>
            <label>
              {tr("Tầng", "Floor")}
              <input max="200" min="-5" type="number" value={form.floor} onChange={(event) => setForm({ ...form, floor: event.target.value })} required />
            </label>
            <label>
              {tr("Số phòng", "Room number")}
              <input value={form.roomNumber} onChange={(event) => setForm({ ...form, roomNumber: event.target.value })} required />
            </label>
            <label>
              {tr("Thứ tự hiển thị", "Display order")}
              <input min="0" type="number" value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} />
            </label>
            <label>
              {tr("Diện tích m2", "Area (m2)")}
              <input min="0" type="number" value={form.areaSqm} onChange={(event) => setForm({ ...form, areaSqm: event.target.value })} required />
            </label>
            <label>
              {tr("Giá thuê", "Monthly rent")}
              <input min="0" type="number" value={form.monthlyPrice} onChange={(event) => setForm({ ...form, monthlyPrice: event.target.value })} required />
            </label>
            <label>
              {tr("URL ảnh ngoài", "External image URL")}
              <input value={form.externalImageUrl} onChange={(event) => setForm({ ...form, externalImageUrl: event.target.value })} placeholder={tr("Chỉ dùng khi không upload ảnh S3", "Use only when no S3 image is uploaded")} />
            </label>
            <label className="form-wide">
              {tr("Tiện ích", "Amenities")}
              <input value={form.amenities} onChange={(event) => setForm({ ...form, amenities: event.target.value })} placeholder={tr("Phòng họp, lễ tân, internet", "Meeting rooms, reception, internet")} />
            </label>
            <label className="form-wide">
              {tr("Mô tả", "Description")}
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} />
            </label>
          </div>
          <div className="admin-form-actions">
            <button disabled={isSaving} type="submit">{isSaving ? tr("Đang lưu...", "Saving...") : form.id ? tr("Lưu thay đổi", "Save changes") : tr("Tạo văn phòng", "Create office")}</button>
            <button className="secondary-action" onClick={resetForm} type="button">{tr("Hủy", "Cancel")}</button>
          </div>
        </form>
      </Drawer>

      {viewMode === "table" && <DataTable columns={columns} data={filteredItems} getRowKey={(row) => row.id} isLoading={isLoading} />}
      {viewMode === "floor" && (
        <div className="floor-plan-list">
          {isLoading && <div className="customer-360-loading"><span /><span /><span /></div>}
          {!isLoading && floorGroups.map((group) => (
            <section className="floor-plan-section" key={group.key}>
              <header><div><strong>{group.building}</strong><span>{group.floor === "-" ? tr("Chưa có tầng", "No floor assigned") : `${tr("Tầng", "Floor")} ${group.floor}`}</span></div><small>{group.offices.length} {tr("phòng", "rooms")}</small></header>
              <div className="floor-room-grid">
                {group.offices.map((office) => (
                  <button className={`floor-room floor-room-${office.status.toLowerCase()}`} key={office.id} onClick={() => editOffice(office)} title={`${office.title} · ${formatCurrency(office.monthlyPrice, language)}`} type="button">
                    <span>{office.roomNumber || "--"}</span>
                    <strong>{office.title}</strong>
                    <small>{formatStatus(office.status, language)} · {office.areaSqm} m2</small>
                    <em>{formatCurrency(office.monthlyPrice, language)}</em>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {!isLoading && floorGroups.length === 0 && <div className="admin-empty-state"><strong>{tr("Không có phòng phù hợp", "No matching rooms")}</strong><span>{tr("Hãy thay đổi bộ lọc hiện tại.", "Adjust the current filters.")}</span></div>}
        </div>
      )}
    </section>
  );
}
