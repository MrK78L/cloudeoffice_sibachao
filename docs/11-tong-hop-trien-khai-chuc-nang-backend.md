# Tổng hợp chức năng backend đã triển khai

Ngày cập nhật: 2026-07-17

## 1. Trạng thái triển khai

Các thay đổi trong tài liệu này mới được triển khai trong source code và kiểm tra bằng build cục bộ.

- Chưa chạy `sam deploy`.
- Chưa tạo lại CloudFormation stack.
- Chưa tạo WAF, CloudFront, Lambda, DynamoDB, S3 hoặc tài nguyên tính phí nào.
- `EnableCloudFront` vẫn mặc định là `false`.
- WAF chỉ có template chuẩn bị sẵn và không phát sinh phí cho đến khi chủ động deploy.
- `frontend/.env.development.local` hiện trỏ tới API local, bật office fallback và admin preview; không còn trỏ tới stack AWS đã xóa.

## 2. Nghiệp vụ và bảo mật

### Rental request

- Email của khách phải trùng email trong Cognito JWT.
- Admin được phép tạo yêu cầu thay khách với email khác.
- Chặn một khách tạo nhiều yêu cầu đang mở cho cùng một văn phòng.
- Dùng khóa idempotency trong transaction để hai request đồng thời không tạo bản ghi trùng.
- Áp dụng state machine và điều kiện trạng thái khi admin duyệt hoặc từ chối yêu cầu.
- Rental request mới có `GSI3` để truy vấn trực tiếp theo khách hàng, không quét toàn bảng.

### Hợp đồng

- Kiểm tra khách hàng và văn phòng tồn tại trước khi tạo.
- Kiểm tra rental request thuộc đúng văn phòng và khách hàng.
- Kiểm tra ngày bắt đầu phải trước ngày kết thúc.
- Hợp đồng `ACTIVE` bắt buộc có đủ ngày bắt đầu và kết thúc.
- Áp dụng state machine cho trạng thái hợp đồng.
- Dùng item khóa `ACTIVE_CONTRACT` để không thể có hai hợp đồng hiệu lực trên cùng văn phòng.
- Khi kích hoạt hợp đồng, `TransactWriteCommand` cập nhật đồng thời:
  - Hợp đồng sang `ACTIVE`.
  - Văn phòng sang `LEASED`.
  - Rental request liên quan sang `APPROVED`.
  - Khóa hợp đồng hiệu lực của văn phòng.
- Khi kết thúc hợp đồng, transaction giải phóng khóa và đưa văn phòng về `AVAILABLE`.
- Không cho admin đổi trạng thái văn phòng hoặc khách hàng nếu việc đổi đó phá vỡ hợp đồng đang hiệu lực.

### Upload hợp đồng PDF

- Khách được upload khi `customerId` khớp `sub` hoặc email Cognito.
- Admin luôn được upload.
- Chỉ chấp nhận `application/pdf`.
- Giới hạn 15 MB ở cả frontend, API cấp URL và bước xác nhận S3.
- Kiểm tra chữ ký file `%PDF-`, không chỉ tin phần mở rộng hoặc Content-Type.
- File ban đầu nằm trong `uploads/contracts/`.
- Sau khi xác minh, file được chuyển sang `contracts/`.
- Upload chưa xác nhận tự hết hạn sau một ngày bằng S3 Lifecycle.

## 3. Hình ảnh

### Ảnh văn phòng

- Giới hạn 10 MB trước khi cấp presigned URL.
- Image Processor xóa ảnh vượt quá giới hạn từ S3.
- Sharp giới hạn tối đa 40 triệu pixel để giảm rủi ro ảnh giải nén quá lớn.
- Ảnh hợp lệ được xoay đúng EXIF, resize tối đa 1280 px và chuyển WebP.
- Admin xác nhận upload qua API sau khi PUT S3; metadata chỉ được gắn khi object thực sự tồn tại.
- Event S3 xử lý sớm được giữ lại để tránh tranh chấp với request xác nhận upload.

### Avatar người dùng

- Không ghi avatar mới dạng Data URL vào DynamoDB.
- Avatar được lưu private trong S3 theo `avatars/{cognitoSub}/...`.
- DynamoDB chỉ lưu `avatarKey`.
- API trả presigned `avatarUrl` có thời hạn.
- Chỉ nhận JPG, PNG hoặc WebP, tối đa 2 MB.
- Ảnh cũ được xóa sau khi avatar mới xác nhận thành công.
- Dữ liệu `avatarDataUrl` cũ vẫn được đọc để tương thích trong giai đoạn chuyển đổi.

## 4. Lịch xem văn phòng

Entity mới: `APPOINTMENT`.

Các trạng thái:

- `REQUESTED`
- `CONFIRMED`
- `COMPLETED`
- `REJECTED`
- `CANCELLED`

API khách hàng:

- `POST /appointments`
- `GET /me/appointments`
- `PATCH /me/appointments/{id}`

API admin:

- `GET /admin/appointments`
- `GET /admin/appointments/{id}`
- `PATCH /admin/appointments/{id}`

Đã có giao diện đặt lịch tại trang chi tiết văn phòng, trang lịch hẹn cá nhân và trang quản lý lịch hẹn trong admin.

## 5. Báo cáo CSV

Các endpoint admin:

- `GET /admin/reports/offices.csv`
- `GET /admin/reports/customers.csv`
- `GET /admin/reports/revenue.csv`

Báo cáo revenue hiện phản ánh giá trị thuê tháng trong hợp đồng, chưa phải doanh thu thanh toán thực nhận. Khi thêm hóa đơn/thanh toán cần đổi báo cáo sang dữ liệu giao dịch.

## 6. Cảnh báo hợp đồng hết hạn

Lambda mới: `ContractExpiryNotifierFunction`.

- EventBridge chạy mỗi ngày lúc 01:00 UTC.
- Truy vấn hợp đồng bằng GSI1, không dùng Scan.
- Lọc hợp đồng `ACTIVE` hết hạn trong 30 ngày.
- Tự động chuyển hợp đồng quá hạn sang `EXPIRED`, giải phóng khóa và đưa văn phòng về `AVAILABLE` bằng transaction.
- Gửi một email tổng hợp qua SNS topic hiện có và đánh dấu ngày đã cảnh báo để không gửi lặp mỗi ngày.
- EventBridge Scheduler có hạn mức miễn phí lớn; một lần chạy mỗi ngày gần như không đáng kể về chi phí.

## 7. DynamoDB

- Đã loại bỏ hoàn toàn fallback `Scan` trong business logic.
- Thêm `GSI3` để truy vấn dữ liệu theo khách hàng.
- API danh sách trả thêm `nextToken` từ `LastEvaluatedKey`.
- Dashboard admin đọc đủ các trang dữ liệu thay vì giới hạn 200 item.
- `EnablePointInTimeRecovery=false` là mặc định để giữ chi phí thấp; đặt thành `true` khi lưu dữ liệu production quan trọng.
- Bật mã hóa SSE cho DynamoDB và ba bucket S3; log Lambda được giữ 14 ngày.

Lưu ý: bảng DynamoDB Local cũ không có GSI3. Cần xóa và seed lại bảng local trước khi chạy test mới. Stack AWS trước đó đã bị xóa nên lần deploy sau sẽ tạo bảng mới đúng schema.

## 8. WAF và CloudFront

Template tùy chọn:

`backend/infra/waf-cloudfront-us-east-1.yaml`

Template gồm:

- AWS Managed Common Rule Set.
- Web ACL scope `CLOUDFRONT`.

WAF CloudFront bắt buộc tạo tại `us-east-1`. Sau khi AWS duyệt CloudFront:

1. Cân nhắc ngân sách trước khi bật WAF.
2. Deploy template WAF tại `us-east-1`.
3. Lấy output `WebAclArn`.
4. Truyền ARN vào parameter `CloudFrontWebAclArn` của stack chính.
5. Đặt `EnableCloudFront=true`.

Không deploy WAF khi chỉ test local. WAF có phí cố định và phí theo request; cần kiểm tra bảng giá AWS hiện hành trước khi bật.

## 9. File đã loại bỏ

Đã xóa:

`backend/functions/business-logic/index.mjs`

SAM sử dụng `app.mjs` qua handler `app.handler`; file cũ không còn tham chiếu và có logic lỗi thời.

## 10. Kiểm tra đã chạy

```powershell
node --check backend/functions/business-logic/app.mjs
node --check backend/functions/image-processor/index.mjs
node --check backend/functions/contract-expiry-notifier/index.mjs
node --check backend/seed-data.mjs

cd backend
sam validate --template-file infra/template.yaml --lint --region ap-southeast-1
sam build --use-container --config-file samconfig.toml --no-cached

cd ..
npm --prefix frontend run build
```

Kết quả tại thời điểm cập nhật:

- Node syntax: đạt.
- SAM template validation: đạt.
- SAM build ba Lambda Node.js 22.x: cần chạy lại sau khi bật Docker Desktop; không dùng artifact build trực tiếp trên Windows vì `sharp` sẽ sai nền tảng.
- Frontend TypeScript và Vite build: đạt.

## 11. Các bước chỉ thực hiện khi sẵn sàng deploy lại

Không chạy các lệnh dưới đây trong giai đoạn chờ CloudFront.

```powershell
cd D:\THUCTAPTT\cloudoffice\backend
npm run install:all
sam build --use-container --config-file samconfig.toml --no-cached
sam deploy --config-file samconfig.toml --template-file .aws-sam/build/template.yaml
```

Trước khi deploy production cần đổi `CorsAllowOrigin` từ `*` sang domain CloudFront hoặc domain Route 53 thực tế.

Sau khi deploy lại, lấy output mới và tạo `frontend/.env.production.local`:

```env
VITE_API_BASE_URL=https://NEW_API_ID.execute-api.ap-southeast-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=ap-southeast-1_NEW_POOL
VITE_COGNITO_CLIENT_ID=NEW_CLIENT_ID
VITE_USE_DEMO_FALLBACK=false
VITE_BYPASS_ADMIN_AUTH=false
```
