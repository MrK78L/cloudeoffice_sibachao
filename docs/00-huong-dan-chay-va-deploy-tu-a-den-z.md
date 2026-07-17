# Huong Dan Chay Va Deploy Du An CloudOffice Tu A Den Z

Tai lieu nay gom chung cac buoc thiet lap AWS, build, deploy backend, cau hinh Cognito, chay frontend, upload frontend va test he thong.

Du an hien tai tach 2 phan:

- Backend: AWS SAM, Lambda Node.js 22.x, API Gateway HTTP API, DynamoDB, Cognito, S3, SNS.
- Frontend: React/Vite, goi API Gateway va Cognito.

## 1. Yeu Cau Moi Truong

Can cai san:

- Node.js 22.x.
- npm 10+.
- AWS CLI v2.
- AWS SAM CLI.
- Docker Desktop dang chay de build Lambda Linux dung cach.
- Tai khoan AWS co quyen tao Lambda, API Gateway, DynamoDB, Cognito, S3, IAM, SNS.
- Neu muon dung CloudFront: tai khoan AWS phai duoc AWS verify de tao CloudFront distribution.

Kiem tra:

```powershell
node --version
npm --version
aws --version
sam --version
docker --version
```

Region dang dung:

```text
ap-southeast-1
```

## 2. Cau Truc Thu Muc Chinh

```text
D:\THUCTAPTT\cloudoffice
├── backend
│   ├── infra/template.yaml
│   ├── samconfig.toml
│   ├── functions/business-logic
│   ├── functions/image-processor
│   └── seed-data.mjs
├── frontend
│   ├── src
│   ├── .env
│   └── package.json
└── docs
```

## 3. Thiet Lap AWS CLI

Chay:

```powershell
aws configure
```

Nhap:

```text
AWS Access Key ID
AWS Secret Access Key
Default region name: ap-southeast-1
Default output format: json
```

Kiem tra dang nhap AWS:

```powershell
aws sts get-caller-identity
```

Neu len duoc `Account`, `UserId`, `Arn` la AWS CLI da dung.

## 4. Cai Dependency

Dung tu thu muc goc:

```powershell
cd cloudoffice
```

Cai frontend:

```powershell
npm --prefix frontend install
```

Cai backend:

```powershell
npm --prefix backend run install:all
```

Neu chi cai tung Lambda:

```powershell
npm --prefix backend run install:business
npm --prefix backend run install:image
```

## 5. Cau Hinh Backend SAM

File cau hinh:

```text
..\cloudoffice\backend\samconfig.toml
```

Dang dung stack:

```toml
stack_name = "cloffice-backend"
region = "ap-southeast-1"
```

Neu chua duoc AWS verify CloudFront, de:

```toml
EnableCloudFront=\"false\"
```

Neu tai khoan AWS da duoc verify CloudFront, co the doi thanh:

```toml
EnableCloudFront=\"true\"
```

Dong `parameter_overrides` vi du:

```toml
parameter_overrides = "ProjectName=\"cloffice\" AlertEmail=\"your-email@example.com\" CorsAllowOrigin=\"*\" EnableCloudFront=\"false\""
```

Giai thich:

- `ProjectName`: tien to ten resource AWS.
- `AlertEmail`: email nhan canh bao SNS.
- `CorsAllowOrigin`: khi dev co the de `*`; production nen doi thanh domain CloudFront/frontend.
- `EnableCloudFront`: bat/tat tao CloudFront cho frontend S3 private.

## 6. Build Backend

Chay:

```powershell
cd D:\THUCTAPTT\cloudoffice\backend
sam build --use-container --config-file samconfig.toml --no-cached
```

Ket qua dung:

```text
Build Succeeded
BusinessLogicFunction runtime: nodejs22.x
ImageProcessorFunction runtime: nodejs22.x
```

## 7. Deploy Backend Len AWS

Chay:

```powershell
cd cloudoffice\backend
sam deploy --config-file samconfig.toml --template-file .aws-sam/build/template.yaml
```

Neu SAM hoi:

```text
Deploy this changeset? [y/N]
```

Nhap:

```text
y
```

Sau khi deploy xong, lay output:

```powershell
aws cloudformation describe-stacks `
  --stack-name cloffice-backend `
  --region ap-southeast-1 `
  --query "Stacks[0].Outputs"
```

Can ghi lai cac gia tri:

```text
ApiUrl
CognitoUserPoolId
CognitoClientId
FrontendBucketName
StorageBucketName
ProcessedBucketName
CloudFrontUrl neu EnableCloudFront=true
```

Vi du output hien tai cua du an:

```env
VITE_API_BASE_URL=https://ieoyk6qcoe.execute-api.ap-southeast-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=ap-southeast-1_HaIY02QmO
VITE_COGNITO_CLIENT_ID=6lr19rm9t9s7ais6hv6p7ia5p2
```

## 8. Cau Hinh Frontend .env

File:

```text
cloudoffice\frontend\.env
```

Noi dung:

```env
VITE_API_BASE_URL=https://ieoyk6qcoe.execute-api.ap-southeast-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=ap-southeast-1_HaIY02QmO
VITE_COGNITO_CLIENT_ID=6lr19rm9t9s7ais6hv6p7ia5p2

```

Chu thich:

- `VITE_API_BASE_URL`: lay tu output `ApiUrl`.
- `VITE_COGNITO_USER_POOL_ID`: lay tu output `CognitoUserPoolId`.
- `VITE_COGNITO_CLIENT_ID`: lay tu output `CognitoClientId`.


## 9. Chay Frontend Local Voi Backend AWS

Dung khi chua co CloudFront hoac muon test nhanh:

```powershell
cd D:\THUCTAPTT\cloudoffice
npm --prefix frontend run dev
```

Mo:

```text
http://localhost:5173
```

Neu vao admin bi chan, can login bang user thuoc group `admin`.

## 10. Build Frontend

Chay:

```powershell
cd D:\THUCTAPTT\cloudoffice
npm --prefix frontend run build
```

Ket qua build nam o:

```text
D:\THUCTAPTT\cloudoffice\frontend\dist
```

## 11. Deploy Frontend

### 11.1. Neu Chua Bat CloudFront

Ban co the upload frontend len bucket, nhung bucket hien dang private nen chua co URL website public on dinh de nguoi dung truy cap.

Upload:

```powershell
aws s3 sync frontend/dist s3://cloffice-frontend-665063747441-ap-southeast-1 --delete --region ap-southeast-1
```

Trang web public chua truy cap duoc neu khong co CloudFront. Khi chua co CloudFront, nen test bang:

```text
http://localhost:5173
```

### 11.2. Neu Da Bat CloudFront

Upload frontend:

```powershell
aws s3 sync frontend/dist s3://TEN_FRONTEND_BUCKET --delete --region ap-southeast-1
```

Lay distribution id:

```powershell
aws cloudfront list-distributions --output table
```

Xoa cache CloudFront:

```powershell
aws cloudfront create-invalidation `
  --distribution-id DISTRIBUTION_ID `
  --paths "/*"
```

Mo website bang output:

```text
CloudFrontUrl
```

## 12. Tao User Cognito De Test

Voi user tao tu frontend dang ky, can email that de nhan ma xac nhan.

Voi user tao thu cong bang CLI, co the set email verified va password permanent.

Tao user:

```powershell
aws cognito-idp admin-create-user `
  --user-pool-id ap-southeast-1_HaIY02QmO `
  --username "admin@example.com" `
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true Name=name,Value="Admin" `
  --message-action SUPPRESS `
  --region ap-southeast-1
```

Set password permanent de tranh `FORCE_CHANGE_PASSWORD`:

```powershell
aws cognito-idp admin-set-user-password `
  --user-pool-id ap-southeast-1_HaIY02QmO `
  --username "admin@example.com" `
  --password "Password123" `
  --permanent `
  --region ap-southeast-1
```

Them user vao group admin:

```powershell
aws cognito-idp admin-add-user-to-group `
  --user-pool-id ap-southeast-1_HaIY02QmO `
  --username "admin@example.com" `
  --group-name admin `
  --region ap-southeast-1
```

Kiem tra user:

```powershell
aws cognito-idp admin-get-user `
  --user-pool-id ap-southeast-1_HaIY02QmO `
  --username "admin@example.com" `
  --region ap-southeast-1
```

Neu bi loi `username failed to satisfy constraint`, nghia la `--username` dang rong hoac chua thay bang email/username that.

Lay danh sach username:

```powershell
aws cognito-idp list-users `
  --user-pool-id ap-southeast-1_HaIY02QmO `
  --region ap-southeast-1 `
  --query "Users[].Username"
```

## 13. Seed Du Lieu DynamoDB

### 13.1. Seed Local DynamoDB

Can chay DynamoDB Local truoc.

Seed:

```powershell
cd D:\THUCTAPTT\cloudoffice\backend
npm run seed:local
```

Script se tu tao table local neu chua co.

### 13.2. Seed AWS DynamoDB

Can biet table name. Theo template:

```text
cloffice-offices-table
```

Chay:

```powershell
cd D:\THUCTAPTT\cloudoffice\backend
node seed-data.mjs --table cloffice-offices-table --region ap-southeast-1
```

Luu y: seed len AWS se ghi du lieu that vao DynamoDB.

## 14. Test API Backend

Test public API:

```powershell
Invoke-RestMethod `
  -Uri "https://ieoyk6qcoe.execute-api.ap-southeast-1.amazonaws.com/offices" `
  -Method GET
```

Voi API can auth, frontend se tu gui Bearer token sau khi login.

Neu dung script local:

```powershell
cd D:\THUCTAPTT\cloudoffice\backend
.\scripts\test-api-local.ps1
```

## 15. Test Cac Chuc Nang Chinh

Nen test theo thu tu:

1. Mo frontend local.
2. Dang ky user moi bang email that.
3. Xac nhan email bang code Cognito.
4. Dang nhap.
5. Xem danh sach van phong.
6. Gui yeu cau thue.
7. Dang nhap user admin.
8. Vao `/admin`.
9. CRUD van phong.
10. Upload anh van phong len S3.
11. Kiem tra anh hien thi o trang danh sach/trang chu.
12. CRUD khach hang.
13. CRUD hop dong.
14. Kiem tra logic xoa bi chan khi con hop dong/yeu cau lien quan.
15. Cap nhat ho so user va doi mat khau.

## 16. Luong Xu Ly Anh Van Phong

He thong hien dung luong:

```text
Admin chon anh
Frontend xin signed upload URL tu backend
Frontend PUT anh len S3 StorageBucket
Backend luu imageKey vao DynamoDB
ImageProcessor Lambda resize anh sang WebP
ImageProcessor luu processedImageKey vao DynamoDB
API tra signed GET URL cho frontend hien thi
```

Bucket anh goc:

```text
StorageBucketName
```

Bucket anh da xu ly:

```text
ProcessedBucketName
```

Bucket van private. Frontend khong can biet key AWS, chi dung signed URL.

## 17. Cac Loi Thuong Gap

### 17.1. CloudFront AccessDenied

Loi:

```text
Your account must be verified before you can add new CloudFront resources.
```

Nguyen nhan: AWS account chua duoc verify de tao CloudFront.

Cach nhanh:

```toml
EnableCloudFront=\"false\"
```

Sau do deploy lai backend.

Muốn dùng CloudFront: tao AWS Support case de verify account.

### 17.2. CORS Preflight Bi Chan

Loi:

```text
Response to preflight request doesn't pass access control check
```

Can dam bao da deploy ban backend co route:

```text
OPTIONS /
OPTIONS /{proxy+}
```

Deploy lai:

```powershell
cd D:\THUCTAPTT\cloudoffice\backend
sam build --use-container --config-file samconfig.toml --no-cached
sam deploy --config-file samconfig.toml --template-file .aws-sam/build/template.yaml
```

### 17.3. SAM Upload Artifact Bi Loi Node Modules Long Nhau

Loi co dang:

```text
Unable to upload artifact BusinessLogicFunction
node_modules\orms-backend\build\BusinessLogicFunction\node_modules\...
```

Nguyen nhan: Lambda package co dependency local `file:../..`.

Da sua trong du an: khong khai bao `orms-backend` hoac `office-rental-system` trong package Lambda.

Build lai sach:

```powershell
cd D:\THUCTAPTT\cloudoffice\backend
sam build --use-container --config-file samconfig.toml --no-cached
```

### 17.4. User Cognito FORCE_CHANGE_PASSWORD

Set password permanent:

```powershell
aws cognito-idp admin-set-user-password `
  --user-pool-id ap-southeast-1_HaIY02QmO `
  --username "admin@example.com" `
  --password "Password123" `
  --permanent `
  --region ap-southeast-1
```

### 17.5. Khong Vao Duoc Admin

Can them user vao group admin:

```powershell
aws cognito-idp admin-add-user-to-group `
  --user-pool-id ap-southeast-1_HaIY02QmO `
  --username "admin@example.com" `
  --group-name admin `
  --region ap-southeast-1
```

Sau do logout/login lai de token co group moi.

## 18. Lenh Deploy Tom Tat

Backend:

```powershell
cd D:\THUCTAPTT\cloudoffice\backend
sam build --use-container --config-file samconfig.toml --no-cached
sam deploy --config-file samconfig.toml --template-file .aws-sam/build/template.yaml
```

Frontend local:

```powershell
cd D:\THUCTAPTT\cloudoffice
npm --prefix frontend run dev
```

Frontend build:

```powershell
cd D:\THUCTAPTT\cloudoffice
npm --prefix frontend run build
```

Frontend upload len S3:

```powershell
aws s3 sync frontend/dist s3://cloffice-frontend-665063747441-ap-southeast-1 --delete --region ap-southeast-1
```

## 19. Ket Luan Trang Thai Trien Khai

Khong bat CloudFront:

- Backend AWS chay duoc.
- Frontend local goi AWS backend chay duoc.
- Frontend build/upload S3 duoc.
- Chua co public website URL on dinh vi S3 frontend bucket private.

Bat CloudFront:

- Co website production public qua `CloudFrontUrl`.
- S3 frontend bucket van private.
- Can AWS account duoc verify de tao CloudFront.
