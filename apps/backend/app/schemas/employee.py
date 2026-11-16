from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_serializer

from app.core.timezone import to_vietnam_time
from app.models.employee import SalaryType


class EmployeeBase(BaseModel):
    employee_code: str
    full_name: str
    email: str
    department: str | None = None
    salary_type: SalaryType = SalaryType.HOURLY
    base_salary: float = 0.0
    hourly_rate: float = 30000.0
    allowance: float = 0.0
    cccd: str | None = None
    phone: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    permanent_address: str | None = None
    current_address: str | None = None
    emergency_contact: str | None = None


class EmployeeCreate(EmployeeBase):
    employee_code: str | None = None
    user_id: int


class EmployeeUpdate(BaseModel):
    employee_code: str | None = None
    full_name: str | None = None
    email: str | None = None
    department: str | None = None
    salary_type: SalaryType | None = None
    base_salary: float | None = None
    hourly_rate: float | None = None
    allowance: float | None = None
    cccd: str | None = None
    phone: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    permanent_address: str | None = None
    current_address: str | None = None
    emergency_contact: str | None = None


class EmployeeResponse(EmployeeBase):
    id: int
    user_id: int
    face_enrolled: bool
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at")
    def serialize_datetime(self, value: datetime | None, _info):
        return to_vietnam_time(value)

    model_config = ConfigDict(from_attributes=True)