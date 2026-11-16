from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, Enum as SQLEnum, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SalaryType(str, Enum):
    HOURLY = "HOURLY"
    MONTHLY = "MONTHLY"


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    employee_code: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
    )

    full_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
    )

    department: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    store_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("store_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    salary_type: Mapped[SalaryType] = mapped_column(
        SQLEnum(SalaryType, name="salary_type"),
        default=SalaryType.HOURLY,
        server_default="HOURLY",
        nullable=False,
    )

    base_salary: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        server_default="0",
        nullable=False,
    )

    hourly_rate: Mapped[float] = mapped_column(
        Float,
        default=30000.0,
        server_default="30000",
        nullable=False,
    )

    allowance: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        server_default="0",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(
        "User",
        back_populates="employee",
    )

    face_data: Mapped[list["FaceData"]] = relationship(
        "FaceData",
        back_populates="employee",
        cascade="all, delete-orphan",
    )

    attendance: Mapped[list["Attendance"]] = relationship(
        "Attendance",
        back_populates="employee",
        cascade="all, delete-orphan",
    )

    schedule_assignments: Mapped[list["ScheduleAssignment"]] = relationship(
        "ScheduleAssignment",
        back_populates="employee",
        cascade="all, delete-orphan",
    )

    @property
    def face_enrolled(self) -> bool:
        return bool(self.face_data)