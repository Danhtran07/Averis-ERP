from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class StoreProfile(Base):
    __tablename__ = "store_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    store_name: Mapped[str] = mapped_column(String(150), nullable=False)
    company_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    tax_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    business_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="Quán Cà phê / Trà sữa",
    )
    employee_scale: Mapped[str] = mapped_column(
        String(60),
        nullable=False,
        default="1 - 15 nhân sự",
    )
    branch_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )
    service_plan: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="PROFESSIONAL",
    )
    business_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    representative_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    representative_title: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default="Chủ cơ sở / Giám đốc",
    )
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    default_hourly_rate: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=35000,
    )
    late_tolerance_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=15,
    )
    min_face_similarity: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.65,
    )
    owner_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
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
