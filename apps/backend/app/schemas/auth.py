from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserResponse(BaseModel):
    id: int
    username: str
    role: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class StoreProfileResponse(BaseModel):
    id: int
    store_name: str
    company_name: str | None = None
    tax_code: str | None = None
    business_type: str
    employee_scale: str = "1 - 15 nhân sự"
    branch_count: int = 1
    service_plan: str = "PROFESSIONAL"
    business_email: str | None = None
    representative_name: str | None = None
    representative_title: str | None = "Chủ cơ sở / Giám đốc"
    address: str | None = None
    phone: str | None = None
    default_hourly_rate: int = 35000
    late_tolerance_minutes: int = 15
    min_face_similarity: float = 0.65
    owner_user_id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class StoreProfileUpdate(BaseModel):
    store_name: str = Field(..., min_length=2, max_length=150)
    company_name: str | None = Field(default=None, max_length=200)
    tax_code: str | None = Field(default=None, max_length=30)
    business_type: str = Field(default="Quán Cà phê / Trà sữa", max_length=100)
    employee_scale: str = Field(default="1 - 15 nhân sự", max_length=60)
    branch_count: int = Field(default=1, ge=1, le=1000)
    service_plan: str = Field(default="PROFESSIONAL", max_length=50)
    business_email: str | None = Field(default=None, max_length=255)
    representative_name: str | None = Field(default=None, max_length=120)
    representative_title: str | None = Field(default="Chủ cơ sở / Giám đốc", max_length=100)
    address: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=30)
    default_hourly_rate: int = Field(default=35000, ge=1000, le=5000000)
    late_tolerance_minutes: int = Field(default=15, ge=0, le=120)
    min_face_similarity: float = Field(default=0.65, ge=0.45, le=0.95)


class StoreRegisterRequest(BaseModel):
    store_name: str = Field(..., min_length=2, max_length=150)
    company_name: str = Field(..., min_length=2, max_length=200)
    tax_code: str = Field(..., min_length=8, max_length=30)
    business_type: str = Field(default="Quán Cà phê / Trà sữa", max_length=100)
    employee_scale: str = Field(default="1 - 15 nhân sự", max_length=60)
    branch_count: int = Field(default=1, ge=1, le=1000)
    service_plan: str = Field(default="PROFESSIONAL", max_length=50)
    business_email: str | None = Field(default=None, max_length=255)
    representative_title: str | None = Field(default="Chủ cơ sở / Giám đốc", max_length=100)
    address: str = Field(..., min_length=3, max_length=255)
    phone: str = Field(..., min_length=8, max_length=30)
    default_hourly_rate: int = Field(default=35000, ge=1000, le=5000000)
    late_tolerance_minutes: int = Field(default=15, ge=0, le=120)
    min_face_similarity: float = Field(default=0.65, ge=0.45, le=0.95)
    admin_full_name: str = Field(..., min_length=2, max_length=100)
    admin_email: str = Field(..., min_length=5, max_length=255)
    admin_username: str = Field(..., min_length=3, max_length=50)
    admin_password: str = Field(..., min_length=6, max_length=100)


class StoreRegisterResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse
    store: StoreProfileResponse
