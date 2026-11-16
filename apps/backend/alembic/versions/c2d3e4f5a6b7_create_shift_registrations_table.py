"""create shift registrations table

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-11-16 17:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

shift_registration_status_enum = postgresql.ENUM(
    "PENDING", "APPROVED", "REJECTED", name="shift_registration_status", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Create enum type if not exists
        op.execute(
            "DO $$ BEGIN "
            "IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shift_registration_status') THEN "
            "CREATE TYPE shift_registration_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED'); "
            "END IF; END $$;"
        )

    op.create_table(
        "shift_registrations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("shift_id", sa.Integer(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            shift_registration_status_enum,
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("admin_note", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shift_id"], ["shifts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id", "date", name="uq_employee_date_shift_registration"),
    )
    op.create_index(op.f("ix_shift_registrations_id"), "shift_registrations", ["id"], unique=False)
    op.create_index(op.f("ix_shift_registrations_employee_id"), "shift_registrations", ["employee_id"], unique=False)
    op.create_index(op.f("ix_shift_registrations_date"), "shift_registrations", ["date"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_shift_registrations_date"), table_name="shift_registrations")
    op.drop_index(op.f("ix_shift_registrations_employee_id"), table_name="shift_registrations")
    op.drop_index(op.f("ix_shift_registrations_id"), table_name="shift_registrations")
    op.drop_table("shift_registrations")
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS shift_registration_status;")
