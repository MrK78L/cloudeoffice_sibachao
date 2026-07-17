import { ChangeEvent, FormEvent, useEffect, useState } from "react";
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
import type { Office } from "../../features/offices";
import { toFriendlyMessage } from "../../lib/friendlyErrors";
import { formatCurrency } from "../../shared/utils/format";

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
};

const emptyForm: OfficeForm = {
  title: "",
  address: "",
  areaSqm: "",
  monthlyPrice: "",
  status: "AVAILABLE",
  description: "",
  externalImageUrl: "",
  amenities: ""
};

export function AdminOfficesPage() {
  const { data, isLoading, error, refetch } = useAdminQuery(getAdminOffices, []);
  const [form, setForm] = useState<OfficeForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [currentImageUrl, setCurrentImageUrl] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const items = data?.items ?? [];

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const resetForm = () => {
    setForm(emptyForm);
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
      amenities: office.amenities?.join(", ") ?? ""
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
      setActionError("Ảnh văn phòng phải có định dạng JPG, PNG hoặc WebP.");
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
    amenities: form.amenities.split(",").map((item) => item.trim()).filter(Boolean)
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

      setActionSuccess(form.id ? "Đã cập nhật văn phòng." : "Đã tạo văn phòng mới.");
      resetForm();
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (office: Office) => {
    if (!window.confirm(`Xóa văn phòng "${office.title}"? Hệ thống sẽ chặn nếu còn hợp đồng hoặc yêu cầu thuê liên quan.`)) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      await deleteAdminOffice(office.id);
      setActionSuccess("Đã ngừng hoạt động văn phòng.");
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    }
  };

  const columns: DataTableColumn<Office>[] = [
    {
      key: "image",
      header: "Ảnh",
      render: (row) => (
        <span className="admin-office-thumb">
          {row.imageUrl ? <img alt="" src={row.imageUrl} /> : <span>OR</span>}
        </span>
      )
    },
    { key: "title", header: "Tên văn phòng", render: (row) => row.title },
    { key: "address", header: "Địa chỉ", render: (row) => row.address },
    { key: "area", header: "Diện tích", render: (row) => `${row.areaSqm} m2` },
    { key: "price", header: "Giá thuê", render: (row) => formatCurrency(row.monthlyPrice) },
    { key: "status", header: "Trạng thái", render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{row.status}</span> },
    {
      key: "actions",
      header: "Thao tác",
      render: (row) => (
        <div className="admin-row-actions">
          <button onClick={() => editOffice(row)} type="button">Sửa</button>
          <button className="danger-action" onClick={() => void handleDelete(row)} type="button">Xóa</button>
        </div>
      )
    }
  ];

  const previewUrl = imagePreviewUrl || currentImageUrl || form.externalImageUrl;

  return (
    <section className="admin-page">
      <div className="admin-page-title admin-page-title-row">
        <div>
          <p className="eyebrow">Quản lý</p>
          <h1>Văn phòng</h1>
        </div>
        <button className="admin-primary-action" onClick={() => setIsFormOpen((value) => !value)} type="button">
          {isFormOpen ? "Đóng form" : "Thêm văn phòng"}
        </button>
      </div>

      {error && <div className="notice danger">{error}</div>}
      {actionError && <div className="notice danger">{actionError}</div>}
      {actionSuccess && <div className="notice success">{actionSuccess}</div>}

      {isFormOpen && (
        <form className="admin-form-panel" onSubmit={(event) => void handleSubmit(event)}>
          <div className="admin-office-image-field">
            <div className="admin-office-image-preview">
              {previewUrl ? <img alt="" src={previewUrl} /> : <span>Chưa có ảnh</span>}
            </div>
            <div>
              <label className="admin-upload-button">
                Chọn ảnh từ máy
                <input accept="image/jpeg,image/png,image/webp" onChange={handleImageFileChange} type="file" />
              </label>
              <p className="muted">Ảnh sẽ được upload vào S3 private. Lambda xử lý ảnh sẽ tạo bản WebP tối ưu sau khi upload.</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Tên văn phòng
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
            </label>
            <label>
              Trạng thái
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Office["status"] })}>
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="RESERVED">RESERVED</option>
                <option value="LEASED">LEASED</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </label>
            <label>
              Địa chỉ
              <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} required />
            </label>
            <label>
              Diện tích m2
              <input min="0" type="number" value={form.areaSqm} onChange={(event) => setForm({ ...form, areaSqm: event.target.value })} required />
            </label>
            <label>
              Giá thuê
              <input min="0" type="number" value={form.monthlyPrice} onChange={(event) => setForm({ ...form, monthlyPrice: event.target.value })} required />
            </label>
            <label>
              URL ảnh ngoài
              <input value={form.externalImageUrl} onChange={(event) => setForm({ ...form, externalImageUrl: event.target.value })} placeholder="Chỉ dùng khi không upload ảnh S3" />
            </label>
            <label className="form-wide">
              Tiện ích
              <input value={form.amenities} onChange={(event) => setForm({ ...form, amenities: event.target.value })} placeholder="Phòng họp, lễ tân, internet" />
            </label>
            <label className="form-wide">
              Mô tả
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} />
            </label>
          </div>
          <div className="admin-form-actions">
            <button disabled={isSaving} type="submit">{isSaving ? "Đang lưu..." : form.id ? "Lưu thay đổi" : "Tạo văn phòng"}</button>
            <button className="secondary-action" onClick={resetForm} type="button">Hủy</button>
          </div>
        </form>
      )}

      <DataTable columns={columns} data={items} isLoading={isLoading} />
    </section>
  );
}
