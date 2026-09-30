# JPULSE (bduck-system)

JPULSE là hệ thống quản trị nghiệp vụ gồm giao diện web, API và các gói TypeScript dùng chung. Repository này là monorepo dùng `pnpm`; các phân hệ hiện có bao gồm quản lý kho, nhân sự, cơ sở, voucher, hóa đơn và các tích hợp liên quan. Phạm vi nghiệp vụ chi tiết nằm trong [SRS](SRS-JPULSE.docx) và [sơ đồ luồng nghiệp vụ](docs/business-flow-charts.md).

## Cấu trúc repository

| Đường dẫn                                     | Vai trò                                   |
| --------------------------------------------- | ----------------------------------------- |
| `apps/fe-wms`                                 | Giao diện web Next.js, cổng mặc định 3000 |
| `apps/be-wms`                                 | API Node.js/Express, cổng mặc định 4000   |
| `packages/shared-types`                       | Kiểu dữ liệu và hợp đồng dùng chung       |
| `packages/eslint-config`, `packages/tsconfig` | Cấu hình chất lượng mã                    |
| `docs/architecture`                           | Sơ đồ ngữ cảnh, container và luồng xử lý  |
| `docs/hr`, `docs/integrations`                | Tài liệu phân hệ và tích hợp              |
| `.github/workflows`                           | CI kiểm tra và tạo image                  |
| `infra`, `nginx`, `docker-compose*.yml`       | Cấu hình triển khai và chạy bằng Docker   |

Đọc [sơ đồ container](docs/architecture/jpulse-container-diagram.md), [các sơ đồ thành phần C4](docs/architecture/jpulse-component-diagrams.md), [sơ đồ triển khai C4](docs/architecture/jpulse-deployment-diagrams.md) và [các sơ đồ trình tự](docs/architecture/jpulse-sequence-diagrams.md) trước khi thay đổi kiến trúc hoặc tích hợp.

## Yêu cầu phát triển

- Node.js **22 trở lên** và pnpm **9.15.4** (theo `package.json`).
- Quyền truy cập **môi trường thử nghiệm** Firebase/GCP và các dịch vụ tích hợp cần dùng. Mã nguồn không tự cung cấp tài khoản, dữ liệu hoặc khóa truy cập.
- Windows PowerShell hoặc shell tương đương. Docker chỉ cần nếu chọn cách chạy qua Compose.

## Chạy cục bộ

1. Clone repository và đứng tại thư mục gốc.
2. Cài dependency theo lockfile:

   ```bash
   corepack enable
   corepack prepare pnpm@9.15.4 --activate
   pnpm install --frozen-lockfile
   ```

3. Tạo `.env.local` ở gốc từ [`.env.example`](.env.example), sau đó điền **giá trị của môi trường thử nghiệm** do người quản trị cấp. Tối thiểu cần cấu hình Firebase cho tính năng định chạy; các tích hợp email, POS, hóa đơn và tác vụ nền cần cấu hình riêng khi thử các luồng tương ứng. Không dùng thông tin production để thử nghiệm cục bộ. `.env.local` được `.gitignore` loại khỏi Git.
4. Build gói dùng chung và chạy web cùng API:

   ```bash
   pnpm --filter @bduck/shared-types build
   pnpm dev
   ```

   Web chạy tại `http://localhost:3000`. API chạy tại `http://localhost:4000`; `GET /` trả về trạng thái dịch vụ. Tài khoản đăng nhập và dữ liệu thử nghiệm phải được cấp riêng.

Nếu dùng Docker để phát triển, `docker-compose.dev.yml` yêu cầu cả `.env.local` ở gốc và `apps/fe-wms/.env.local` cho frontend. Chỉ đưa các biến cần cho frontend vào file của frontend. Chạy `pnpm docker:dev:up`; Nginx trong Compose định tuyến `app.wms.localhost` tới web và `api.wms.localhost` tới API. Kiểm tra phân giải hai tên miền này trên máy trước khi sử dụng.

## Kiểm tra và build

Chạy từ thư mục gốc:

```bash
pnpm --filter @bduck/shared-types build
pnpm typecheck
pnpm lint:employee-contracts
pnpm build
```

Các bộ kiểm thử theo phân hệ được khai báo trong `package.json`, ví dụ `pnpm test:authorization`, `pnpm test:access-matrix` và `pnpm test:identity-security`. Một số bài kiểm thử yêu cầu Firebase Emulator hoặc quyền truy cập dịch vụ thử nghiệm; xem lệnh tương ứng trước khi chạy. Workflow [Production CI and Images](.github/workflows/deploy-prod.yml) chạy trên `main`, kiểm tra lint/typecheck rồi tạo image frontend và backend; việc chạy workflow **không đồng nghĩa đã triển khai ứng dụng tới production**.

Build frontend có `output: "standalone"`. Trên Windows, bước sao chép dependency của Next.js có thể cần quyền tạo symlink; môi trường build chính thức của workflow chạy trên Linux.

## Cấu hình và triển khai

- [`.env.example`](.env.example) là danh mục biến tham khảo, không phải bộ thông tin xác thực hoạt động. Các biến `NEXT_PUBLIC_*` được đưa vào frontend; không đặt bí mật máy chủ vào nhóm biến này.
- [Docker Compose](docker-compose.yml) dùng `.env.local` ở gốc khi chạy backend và frontend. Cấu hình Nginx nằm tại [`nginx/nginx.conf`](nginx/nginx.conf).
- Workflow [Deploy Test](.github/workflows/deploy-test.yml) dùng GitHub Actions và các secret/quyền máy chủ thử nghiệm. Các lệnh GCP cho backend được khai báo trong `package.json` và `cloudbuild.yaml`.
- Firestore rules/indexes nằm tại [`firestore.rules`](firestore.rules) và [`firestore.indexes.json`](firestore.indexes.json). Không áp dụng migration, cập nhật rules hoặc chạy script production khi chưa có kế hoạch triển khai và bản sao lưu được xác nhận.
