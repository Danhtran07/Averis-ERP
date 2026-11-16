<div align="center">

# ⚡ AVERIS ERP
### **AI-Powered Biometrics Attendance & Workforce Management System**
*Nền tảng Quản trị Nhân sự & Chấm công Sinh trắc học Chuẩn Doanh nghiệp*

---

[![React 18](https://img.shields.io/badge/Frontend-React_18_%7C_TypeScript-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI_%7C_Python_3.12-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![InsightFace](https://img.shields.io/badge/AI_Engine-InsightFace_ArcFace-FF6B35?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/deepinsight/insightface)
[![MediaPipe](https://img.shields.io/badge/Vision-MediaPipe_3D_Mesh-00C7B7?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/mediapipe)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL_15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/DevOps-Docker_Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

<p align="center">
  <a href="#-tổng-quan-hệ-thống">Tổng quan</a> •
  <a href="#-kiến-trúc-hệ-thống">Kiến trúc</a> •
  <a href="#-các-phân-hệ-nghiệp-vụ-cốt-lõi">Phân hệ Nghiệp vụ</a> •
  <a href="#-hướng-dẫn-khởi-động-nhanh-với-docker">Cài đặt & Khởi động</a> •
  <a href="#-tài-liệu-api--cổng-truy-cập">Cổng Dịch vụ</a> •
  <a href="#-bộ-kiểm-thử-tự-động">Kiểm thử (155+ Tests)</a>
</p>

</div>

> [!NOTE]
> **Averis ERP** kết hợp **AI nhận diện khuôn mặt ArcFace 512 chiều** và công nghệ **Passive Anti-Spoofing** (chống giả mạo thụ động không cần nháy mắt/quay đầu), giải quyết triệt để bài toán chấm công nhanh, chống gian lận và tự động hóa toàn bộ chu trình tính công, tính lương tăng ca (OT) cho chuỗi bán lẻ, F&B và văn phòng.

---

## 💎 Điểm Nổi Bật Của Hệ Thống

```
 ⏱️ Nhận diện < 1.0s     🛡️ Passive Anti-Spoofing    🌙 Ca Đêm qua ngày (Overnight)
 🔒 Khóa Cooldown 2 phút   💰 Tính lương OT (1.5x)     📋 Duyệt đơn từ 4 cấp độ
```

| Tính năng cốt lõi | Công nghệ áp dụng | Giá trị mang lại |
| :--- | :--- | :--- |
| **Kiosk Fast Biometrics** | InsightFace ArcFace + MediaPipe | Quẹt mặt tức thì, không ùn tắc giờ cao điểm tại quầy. |
| **Passive Anti-Spoofing** | 2D FFT Moiré + 3D Landmark Depth | Chống ảnh in giấy, màn hình điện thoại & video phát lại mà không phiền toái. |
| **Double-tap Cooldown** | Time-lock Debounce Engine (2 phút) | Chống quẹt nhầm ra ca khi nhân viên vừa chấm vào ca. |
| **Quản lý Ca & Phân ca tuần** | Shift Hours Resolver (Timezone UTC+7) | Xử lý hoàn hảo ca gãy, ca xoay, ca đêm xuyên ngày qua 0h. |
| **Tự động Tính Công & OT** | Real-time Attendance Policy Engine | Tự động tính số phút trễ, về sớm và số phút làm thêm giờ (OT). |
| **Bảng lương Giờ & Xuất CSV** | F&B Payroll Engine (150% OT rate) | Ước tính lương chính xác, xuất file CSV chuẩn Excel UTF-8 BOM. |
| **Quy trình Đơn từ & Phê duyệt** | Request State Machine (Pending/Approved) | Số hóa 100% đơn nghỉ phép, quên chấm công, giải trình đi trễ. |

---

## 🏛 Kiến trúc Hệ thống

Hệ thống được thiết kế theo mô hình **Microservices-ready Monorepo**, phân tách rành mạch giữa giao diện Kiosk, nghiệp vụ Backend, engine AI thị giác máy tính và cơ sở dữ liệu:

```mermaid
flowchart TD
    subgraph Client ["🖥️ Client Tier (Trình duyệt & Kiosk Chấm công)"]
        UI["React 18 SPA (Vite + Tailwind CSS)"]
        MP["MediaPipe FaceMesh (Khung Oval & Đo ổn định)"]
        WA["Web Audio API (Âm thanh Ting! & Cảnh báo)"]
        UI --- MP
        UI --- WA
    end

    subgraph BackendTier ["⚙️ Application Tier (Cổng API & Nghiệp vụ ERP)"]
        BE["FastAPI Core Backend (Python 3.12)"]
        SR["Shift Resolver (UTC+7 / Ca đêm qua 0h)"]
        AP["Attendance Policy (Tính trễ, về sớm & OT)"]
        PE["Payroll Engine (Lương giờ & Hệ số OT 1.5x)"]
        BE --> SR
        BE --> AP
        BE --> PE
    end

    subgraph AITier ["🧠 Intelligence Tier (Engine Thị giác Máy tính)"]
        AI["FastAPI AI Service (Python 3.11)"]
        AF["InsightFace ArcFace (Model buffalo_l - 512-dim)"]
        PAS["Passive Anti-Spoofing Engine (2D FFT Moiré / Specular Glare / Depth)"]
        AI --> AF
        AI --> PAS
    end

    subgraph DataTier ["🗄️ Persistence Tier (Lưu trữ Dữ liệu & Vector)"]
        DB[("PostgreSQL 15 (DB: averis)\nLưu trữ Nhân sự, Ca làm việc,\nLịch tuần & Vector 512 chiều")]
    end

    UI -->|"HTTP / WebSocket (Port 5173)"| BE
    BE -->|"gRPC / HTTP POST (Port 8000 -> 8002)"| AI
    BE -->|"SQLAlchemy ORM + Alembic (Port 5433)"| DB

    style Client fill:#f8fafc,stroke:#0284c7,stroke-width:2px
    style BackendTier fill:#f8fafc,stroke:#0d9488,stroke-width:2px
    style AITier fill:#f8fafc,stroke:#ea580c,stroke-width:2px
    style DataTier fill:#f8fafc,stroke:#4f46e5,stroke-width:2px
```

---

## 📦 Các Phân Hệ Nghiệp Vụ Cốt Lõi

### 1. Kiosk Chấm công Sinh trắc học Thông minh
* **Tự động nhận diện vào ca / ra ca:** Tự động đối chiếu thời gian quẹt mặt với ca làm việc được phân công hôm nay để điền vào `check_in` hoặc `check_out`.
* **Công nghệ chống giả mạo thụ động (Passive Anti-Spoofing):**
  * *Phân tích tần số 2D FFT:* Phát hiện tức thì các sọc vân Moiré sinh ra bởi màn hình LED/OLED của điện thoại và máy tính bảng.
  * *Độ biến thiên độ sâu 3D (Landmark Depth Variance):* Phân tích 468 điểm tọa độ trên khuôn mặt để loại trừ ảnh phẳng in trên giấy.
  * *Vi chuyển động 2 khung hình (2-frame Micro-motion):* Chụp liên tiếp 2 khung hình cách nhau 220ms để nhận diện nhịp sống sinh học tự nhiên mà **người dùng không cần nháy mắt hay quay đầu**.
* **Khóa chống quét đúp tức thì (Double-tap Cooldown 2 phút):** Tránh trường hợp nhân viên vừa chấm vào ca, đứng lại nán nhìn màn hình bị máy quét tiếp thành ra ca.

---

### 2. Quản lý Ca & Phân ca Tuần Linh Hoạt
* **Đa dạng loại ca (`/shifts`):** Ca Sáng, Ca Chiều, Ca Gãy và **Ca Đêm qua ngày (Overnight Shift)** (ví dụ: 22:00 hôm nay đến 06:00 sáng hôm sau).
* **Cấu hình ca chi tiết:**
  * `late_tolerance_minutes`: Số phút cho phép đi trễ mà không bị phạt (ví dụ: 15 phút).
  * `early_checkin_minutes`: Cho phép chấm công sớm trước giờ ca (ví dụ: 30 phút).
  * `checkin_close_minutes`: Mốc khóa giờ vào ca để chuyển sang xét vắng mặt.
* **Lịch phân ca tuần (`/schedules`):** Lập ma trận ca làm việc 7 ngày trong tuần từ Thứ Hai đến Chủ Nhật và gán linh hoạt cho từng nhân sự.

---

### 3. Tự động Tính Công & Tăng Ca (Overtime - OT)
* **Đo thời gian thực:**
  * Giờ vào thực tế, giờ ra thực tế, tổng thời gian làm việc thực tế (`working_minutes`).
  * Tự động tính số phút đi trễ (`late_minutes`) và số phút về sớm (`early_leave_minutes`).
* **Tính toán OT chuẩn xác:**
  * Khi nhân viên ra ca sau mốc kết thúc ca làm việc:
    $$\text{overtime\_minutes} = \max(0, \text{Giờ Check-out} - \text{Giờ kết thúc ca})$$
  * Dữ liệu OT được ghi nhận tự động vào cơ sở dữ liệu và cộng dồn theo tháng.

---

### 4. Bảng công Tháng & Ước tính Lương (Payroll Engine)
* **Báo cáo tổng hợp tháng (`/timesheet`):** Thống kê số ngày đúng giờ, trễ, vắng, tổng phút làm việc, tổng phút đi trễ, tổng phút về sớm, tổng phút tăng ca của từng nhân viên.
* **Công thức tính lương chuẩn F&B / theo giờ:**
  $$\text{Lương ước tính} = \left(\text{Giờ làm chuẩn} + \text{Giờ OT} \times 1.5\right) \times \text{Đơn giá lương theo giờ (VNĐ/h)}$$
* **Xuất báo cáo CSV chuẩn Excel:** Xuất file `averis_payroll_YYYY_MM.csv` với định dạng **UTF-8 BOM**, mở trực tiếp bằng Microsoft Excel mà không bị lỗi ký tự tiếng Việt.

---

### 5. Quy trình Quản lý Đơn từ & Phê duyệt (`/requests`)
* **Dành cho nhân viên:** Tạo đơn trực tuyến, tra cứu lịch sử và nhận kết quả phê duyệt ngay tức thì.
  * 📝 `FORGOT_CHECKIN`: Quên chấm công vào hoặc ra ca.
  * ⏱️ `LATE_EXPLANATION`: Giải trình lý do đi trễ.
  * 🚪 `EARLY_LEAVE`: Giải trình lý do xin về sớm.
  * 🏖️ `LEAVE`: Xin nghỉ phép có phép.
* **Dành cho quản trị viên:** Xem danh sách đơn đang chờ (`PENDING`), phê duyệt (`APPROVED`) hoặc từ chối (`REJECTED`) kèm phản hồi quản trị viên.

---

## ⚡ Hướng dẫn Khởi động Nhanh với Docker

Chỉ cần cài đặt **Docker Desktop** và thực hiện 2 bước đơn giản để khởi chạy toàn bộ 4 containers:

### Bước 1: Chuẩn bị file cấu hình môi trường

```bash
# Trên Windows (PowerShell / CMD):
copy .env.example .env

# Trên macOS / Linux:
cp .env.example .env
```

### Bước 2: Khởi động toàn bộ hệ thống bằng Docker Compose

```bash
docker compose up -d --build
```

> [!TIP]
> Hệ thống sẽ tự động build và chạy đồng thời cả 4 dịch vụ: Cơ sở dữ liệu PostgreSQL, Backend API, AI Recognition Service và Frontend Web App. Quá trình tạo bảng và chạy migration Alembic được thực thi tự động.

---

## 🌐 Tài liệu API & Cổng Truy Cập

| Ứng dụng | Địa chỉ URL | Chức năng |
| :--- | :--- | :--- |
| **Cổng Web & Kiosk Averis** | [http://localhost:5173](http://localhost:5173) | Kiosk Chấm công khuôn mặt & Giao diện Quản trị ERP |
| **Backend Swagger API Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | Tài liệu trực quan OpenAPI & Thử nghiệm REST endpoints |
| **AI Biometrics API Docs** | [http://localhost:8002/docs](http://localhost:8002/docs) | Tài liệu trích xuất vector khuôn mặt & Passive Liveness |
| **PostgreSQL Database** | `localhost:5433` (DB: `averis`) | Cổng kết nối CSDL (User: `postgres` / Pass: `postgres`) |

---

## ⚙️ Biến Môi Trường Cấu Hình (`.env`)

<details>
<summary><b>Nhấn vào đây để xem chi tiết danh sách biến môi trường</b></summary>

```ini
# ==============================================================================
# CẤU HÌNH DATABASE POSTGRESQL
# ==============================================================================
POSTGRES_DB=averis
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST_PORT=5433

# ==============================================================================
# CẤU HÌNH BACKEND CORE (FASTAPI)
# ==============================================================================
BACKEND_PORT=8000
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/averis
JWT_SECRET_KEY=development-secret-key-change-in-production
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=43200

# ==============================================================================
# CẤU HÌNH AI BIOMETRICS SERVICE (INSIGHTFACE)
# ==============================================================================
AI_SERVICE_URL=http://ai-service:8000
AI_SERVICE_HOST_PORT=8002
FACE_MATCH_THRESHOLD=0.50
MIN_FACE_SIMILARITY_THRESHOLD=0.65
```

</details>

---

## 🧪 Bộ Kiểm Thử Tự Động (155+ Tests)

Dự án duy trì kỷ luật kiểm thử phần mềm nghiêm ngặt với **155+ bài kiểm thử tự động**, đạt tỷ lệ vượt qua **100%**:

```bash
# 1. Chạy 66 bài kiểm thử Backend (Xác thực, phân ca, tính công, tính lương):
docker compose exec backend pytest

# 2. Chạy 73 bài kiểm thử AI Biometrics (ArcFace, trích xuất embedding, liveness):
docker compose exec ai-service pytest

# 3. Chạy 16 bài kiểm thử Frontend (Vitest - Việt hóa thông báo lỗi, xử lý camera):
docker compose exec frontend npm test
```

```text
======================= 66 passed in backend (pytest) =======================
====================== 73 passed in ai-service (pytest) =====================
======================= 16 passed in frontend (vitest) ======================
```

---

## 👥 Phân Quyền Người Dùng (RBAC)

* **👑 Quản trị viên (`ADMIN`):** Quản lý hồ sơ nhân sự, tạo và phân ca tuần, phê duyệt đơn từ, xem bảng tổng hợp công & xuất báo cáo lương tháng, quản lý tài khoản hệ thống.
* **👤 Nhân viên (`EMPLOYEE`):** Thực hiện chấm công tại Kiosk, xem lịch ca cá nhân (`/my-schedule`), tra cứu bảng công của mình (`/attendance`), gửi đơn xin nghỉ phép và giải trình chấm công (`/requests`).

---

<div align="center">

**Averis ERP** • Kiến tạo giải pháp chấm công sinh trắc học thông minh cho doanh nghiệp hiện đại.

<sub>Phát triển với tất cả tâm huyết bởi đội ngũ Averis Team.</sub>

</div>
