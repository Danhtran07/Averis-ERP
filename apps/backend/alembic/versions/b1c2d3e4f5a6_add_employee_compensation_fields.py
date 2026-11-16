"""add employee compensation fields

Revision ID: b1c2d3e4f5a6
Revises: a9b8c7d6e5f4
Create Date: 2026-11-16 16:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a9b8c7d6e5f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

salary_type_enum = sa.Enum("HOURLY", "MONTHLY", name="salary_type")


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Check if enum already exists
        salary_type_enum.create(bind, checkfirst=True)

    op.add_column(
        "employees",
        sa.Column(
            "salary_type",
            salary_type_enum,
            nullable=False,
            server_default="HOURLY",
        ),
    )
    op.add_column(
        "employees",
        sa.Column(
            "base_salary",
            sa.Float(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "employees",
        sa.Column(
            "hourly_rate",
            sa.Float(),
            nullable=False,
            server_default="30000",
        ),
    )
    op.add_column(
        "employees",
        sa.Column(
            "allowance",
            sa.Float(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("employees", "allowance")
    op.drop_column("employees", "hourly_rate")
    op.drop_column("employees", "base_salary")
    op.drop_column("employees", "salary_type")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        salary_type_enum.drop(bind, checkfirst=True)
