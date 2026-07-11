# Hướng dẫn deploy Cloud Office lên AWS

Ngày cập nhật: 2026-07-12

Tài liệu này áp dụng cho source hiện tại của dự án Cloud Office. Quy trình được chia thành nhiều giai đoạn để backend không bị mất nếu CloudFront chưa được AWS duyệt.

## 1. Kiến trúc được deploy

- AWS SAM và CloudFormation.
- API Gateway HTTP API.
- Lambda Node.js 22.x:
  - Business Logic.
  - Image Processor.
  - Contract Expiry Notifier.
- DynamoDB với GSI1, GSI2 và GSI3.
- Cognito User Pool và nhóm `admin`.
- S3 frontend, ảnh gốc, ảnh xử lý và tài liệu hợp đồng.
- EventBridge, SNS và CloudWatch Alarm.
- CloudFront tùy chọn.
- AWS WAF tùy chọn, mặc định không tạo.

## 2. Nguyên tắc triển khai

1. Deploy backend với `EnableCloudFront=false` trước.
2. Kiểm tra API, Cognito và dữ liệu.
3. Chỉ bật CloudFront sau khi AWS đã xác minh tài khoản.
4. WAF chỉ bật khi chấp nhận phí cố định hằng tháng.
5. Không dùng output hoặc Cognito ID của stack cũ đã xóa.

## 3. Yêu cầu trên máy

```powershell
node --version
npm --version
aws --version
sam --version
```

Node.js phải là phiên bản 22.x.

Kiểm tra AWS CLI:

```powershell
aws sts get-caller-identity
aws configure get region
```

Region của stack chính:

```text
ap-southeast-1
```

## 4. Cài dependency

```powershell
cd D:\THUCTAPTT\cloudoffice

npm install
npm --prefix frontend install
npm --prefix backend install
npm --prefix backend run install:all
```

Không chạy `npm install` bên trong `.aws-sam/build`.

## 5. Kiểm tra trước khi deploy

```powershell
cd D:\THUCTAPTT\cloudoffice\backend

node --check functions\business-logic\app.mjs
node --check functions\image-processor\index.mjs
node --check functions\contract-expiry-notifier\index.mjs
node --check seed-data.mjs

sam validate `
  --template-file infra\template.yaml `
  --lint `
  --region ap-southeast-1
```

Build sạch:

```powershell
sam build `
  --config-file samconfig.toml `
  --no-cached
```

Thư mục `.aws-sam` là output build và có thể xóa để build lại khi gặp lỗi artifact.

## 6. Deploy backend chưa có CloudFront

Thay `YOUR_REAL_EMAIL` bằng email nhận cảnh báo thực tế:

```powershell
sam deploy `
  --config-file samconfig.toml `
  --template-file .aws-sam\build\template.yaml `
  --parameter-overrides `
    ProjectName=cloffice `
    AlertEmail=YOUR_REAL_EMAIL `
    CorsAllowOrigin="*" `
    EnableCloudFront=false
```

Xem changeset và xác nhận khi đúng tài nguyên.

Việc dùng `CorsAllowOrigin="*"` ở lần deploy đầu giúp kiểm tra local. Phải thay bằng domain frontend thật trước khi production.

## 7. Lấy output stack

```powershell
aws cloudformation describe-stacks `
  --stack-name cloffice-backend `
  --region ap-southeast-1 `
  --query "Stacks[0].Outputs"
```

Cần lưu các output:

- `ApiUrl`
- `FrontendBucketName`
- `StorageBucketName`
- `ProcessedBucketName`
- `CognitoUserPoolId`
- `CognitoClientId`

Sau khi deploy, mở email và xác nhận SNS subscription để nhận cảnh báo hợp đồng hết hạn và lỗi Lambda.

## 8. Seed DynamoDB

```powershell
cd D:\THUCTAPTT\cloudoffice\backend

npm run seed -- `
  --table cloffice-offices-table `
  --region ap-southeast-1
```

Không truyền `--endpoint` khi seed AWS thật.

Seed hiện tạo dữ liệu nhất quán gồm:

- Văn phòng.
- Khách hàng.
- Rental request.
- Hợp đồng.
- Khóa `ACTIVE_CONTRACT`.
- Lịch xem văn phòng.

## 9. Tạo tài khoản admin Cognito

```powershell
aws cognito-idp admin-create-user `
  --user-pool-id YOUR_POOL_ID `
  --username "admin@example.com" `
  --user-attributes Name=email,Value="admin@example.com" Name=email_verified,Value=true `
  --message-action SUPPRESS `
  --region ap-southeast-1

aws cognito-idp admin-set-user-password `
  --user-pool-id YOUR_POOL_ID `
  --username "admin@example.com" `
  --password "YourStrongPassword123" `
  --permanent `
  --region ap-southeast-1

aws cognito-idp admin-add-user-to-group `
  --user-pool-id YOUR_POOL_ID `
  --username "admin@example.com" `
  --group-name admin `
  --region ap-southeast-1
```

Không dùng chuỗi `YOUR_POOL_ID` nguyên mẫu trong lệnh thật.

## 10. Kiểm tra frontend với backend AWS

Cập nhật `frontend/.env.development.local`:

```env
VITE_API_BASE_URL=https://YOUR_API_ID.execute-api.ap-southeast-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=YOUR_POOL_ID
VITE_COGNITO_CLIENT_ID=YOUR_CLIENT_ID
VITE_USE_DEMO_FALLBACK=false
VITE_BYPASS_ADMIN_AUTH=false
```

Chạy frontend:

```powershell
cd D:\THUCTAPTT\cloudoffice
npm --prefix frontend run dev
```

Kiểm tra:

- Danh sách và chi tiết văn phòng.
- Đăng ký, xác nhận email và đăng nhập.
- Rental request.
- Lịch xem văn phòng.
- Avatar S3.
- Upload PDF hợp đồng.
- Admin CRUD và báo cáo CSV.

## 11. Bật CloudFront

Chỉ thực hiện khi AWS đã duyệt CloudFront cho tài khoản.

```powershell
cd D:\THUCTAPTT\cloudoffice\backend

sam build `
  --config-file samconfig.toml `
  --no-cached

sam deploy `
  --config-file samconfig.toml `
  --template-file .aws-sam\build\template.yaml `
  --parameter-overrides `
    ProjectName=cloffice `
    AlertEmail=YOUR_REAL_EMAIL `
    CorsAllowOrigin="*" `
    EnableCloudFront=true
```

Lấy thêm output:

- `CloudFrontUrl`
- `CloudFrontDistributionId`

CloudFront có thể cần một khoảng thời gian để chuyển sang trạng thái `Deployed`.

## 12. WAF tùy chọn

WAF hiện không được tạo mặc định. Cấu hình tối thiểu thường có phí cố định khoảng 7 USD/tháng trước phí request.

WAF cho CloudFront phải được tạo tại `us-east-1`:

```powershell
aws cloudformation deploy `
  --template-file infra\waf-cloudfront-us-east-1.yaml `
  --stack-name cloffice-waf `
  --region us-east-1 `
  --parameter-overrides ProjectName=cloffice
```

Lấy ARN:

```powershell
$WafArn = aws cloudformation describe-stacks `
  --stack-name cloffice-waf `
  --region us-east-1 `
  --query "Stacks[0].Outputs[?OutputKey=='WebAclArn'].OutputValue | [0]" `
  --output text
```

Gắn WAF vào CloudFront bằng cách deploy lại stack chính:

```powershell
sam deploy `
  --config-file samconfig.toml `
  --template-file .aws-sam\build\template.yaml `
  --parameter-overrides `
    ProjectName=cloffice `
    AlertEmail=YOUR_REAL_EMAIL `
    CorsAllowOrigin="*" `
    EnableCloudFront=true `
    CloudFrontWebAclArn="$WafArn"
```

WAF này bảo vệ traffic đi qua CloudFront. Endpoint API Gateway trực tiếp vẫn được bảo vệ bởi Cognito và kiểm tra quyền trong Lambda.

## 13. Build frontend production

Tạo file `frontend/.env.production.local`:

```env
VITE_API_BASE_URL=https://YOUR_API_ID.execute-api.ap-southeast-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=YOUR_POOL_ID
VITE_COGNITO_CLIENT_ID=YOUR_CLIENT_ID
VITE_USE_DEMO_FALLBACK=false
VITE_BYPASS_ADMIN_AUTH=false
```

Build:

```powershell
cd D:\THUCTAPTT\cloudoffice
npm --prefix frontend run build
```

Upload lên S3:

```powershell
aws s3 sync frontend\dist `
  s3://YOUR_FRONTEND_BUCKET `
  --delete `
  --region ap-southeast-1
```

`--delete` chỉ được dùng sau khi kiểm tra đúng tên frontend bucket.

Xóa cache CloudFront:

```powershell
aws cloudfront create-invalidation `
  --distribution-id YOUR_DISTRIBUTION_ID `
  --paths "/*"
```

## 14. Siết CORS sau khi có URL frontend

Deploy lại backend và thay `*` bằng CloudFront URL:

```text
CorsAllowOrigin="https://YOUR_DISTRIBUTION.cloudfront.net"
```

Giữ nguyên các parameter đang dùng, đặc biệt:

- `EnableCloudFront=true`
- `CloudFrontWebAclArn`, nếu WAF đã bật.

## 15. Kiểm tra sau deploy

```powershell
curl.exe https://YOUR_API_ID.execute-api.ap-southeast-1.amazonaws.com/offices

aws cloudformation describe-stacks `
  --stack-name cloffice-backend `
  --region ap-southeast-1 `
  --query "Stacks[0].StackStatus"
```

Kiểm tra log Lambda:

```powershell
cd D:\THUCTAPTT\cloudoffice\backend
npm run logs:business
npm run logs:image
```

## 16. Khi deploy lỗi

Xem events mới nhất:

```powershell
aws cloudformation describe-stack-events `
  --stack-name cloffice-backend `
  --region ap-southeast-1 `
  --max-items 30
```

Nếu lỗi artifact hoặc đường dẫn lồng `node_modules/orms-backend`:

```powershell
Remove-Item -LiteralPath D:\THUCTAPTT\cloudoffice\backend\.aws-sam -Recurse -Force

cd D:\THUCTAPTT\cloudoffice\backend
npm run install:all
sam build --config-file samconfig.toml --no-cached
```

Không chạy `git reset --hard` hoặc xóa source để sửa lỗi build.

## 17. Xóa tài nguyên để dừng chi phí

Trước tiên xác nhận đúng account và stack:

```powershell
aws sts get-caller-identity
```

Xóa stack chính:

```powershell
cd D:\THUCTAPTT\cloudoffice\backend
sam delete --stack-name cloffice-backend --region ap-southeast-1
```

Nếu đã tạo WAF:

```powershell
aws cloudformation delete-stack `
  --stack-name cloffice-waf `
  --region us-east-1
```

S3 bucket có object có thể cần được làm trống trước khi CloudFormation xóa bucket. Luôn kiểm tra đúng tên bucket trước khi dùng lệnh xóa recursive.

## 18. Checklist production

- [ ] AWS account và region chính xác.
- [ ] Alert email chính xác và SNS đã xác nhận.
- [ ] Backend stack ở trạng thái `CREATE_COMPLETE` hoặc `UPDATE_COMPLETE`.
- [ ] Seed đúng bảng mới.
- [ ] Admin Cognito có group `admin`.
- [ ] Frontend production dùng output mới.
- [ ] `VITE_BYPASS_ADMIN_AUTH=false`.
- [ ] `VITE_USE_DEMO_FALLBACK=false`.
- [ ] CORS không còn `*`.
- [ ] CloudFront ở trạng thái `Deployed`.
- [ ] WAF chỉ bật khi đã duyệt ngân sách.
- [ ] Đã kiểm tra rental request, lịch hẹn, avatar và PDF.
- [ ] Đã cấu hình AWS Budget cảnh báo chi phí.
