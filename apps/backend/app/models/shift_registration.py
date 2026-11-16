from datetime import date, datetime
from enum import Enum

from sqlalchemy import (
    Date,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.timezone import UTCDateTime


class ShiftRegistrationStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ShiftRegistration(Base):
    __tablename__ = "shift_registrations"
    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "date",
            name="uq_employee_date_shift_registration",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    shift_id: Mapped[int | None] = mapped_column(
        ForeignKey("shifts.id", ondelete="SET NULL"),
        nullable=True,
    )

    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    status: Mapped[ShiftRegistrationStatus] = mapped_column(
        SQLEnum(ShiftRegistrationStatus, name="shift_registration_status"),
        nullable=False,
        default=ShiftRegistrationStatus.PENDING,
        server_default="PENDING",
    )

    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    admin_note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    employee = relationship("Employee", back_populates="shift_registrations")
    shift = relationship("Shift")
