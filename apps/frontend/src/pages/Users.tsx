import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  createUser,
  deleteUser,
  getUsers,
  updateUser,
} from "../api/user.api";

import type {
  UserCreate,
  UserResponse,
  UserRole,
  UserUpdate,
} from "../types/user";

import { getApiErrorMessage } from "../api/error";

interface UserForm {
  username: string;
  password: string;
  role: UserRole;
}

const initialForm: UserForm = {
  username: "",
  password: "",
  role: "EMPLOYEE",
};

export default function Users() {
  const [users, setUsers] =
    useState<UserResponse[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [modalOpen, setModalOpen] =
    useState(false);

  const [editingUser, setEditingUser] =
    useState<UserResponse | null>(null);

  const [form, setForm] =
    useState<UserForm>(initialForm);

  const [saving, setSaving] =
    useState(false);

  const [deletingId, setDeletingId] =
    useState<number | null>(null);

  const [formError, setFormError] =
    useState("");

  const [searchQuery, setSearchQuery] =
    useState("");
  const [roleFilter, setRoleFilter] =
    useState<"ALL" | UserRole>("ALL");

  const filteredUsers = users.filter((u) => {
    const matchesSearch = u.username
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase());
    const matchesRole =
      roleFilter === "ALL" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");

      const data = await getUsers();

      setUsers(data);
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          "Unable to load users."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function openCreateModal() {
    setEditingUser(null);
    setForm(initialForm);
    setFormError("");
    setModalOpen(true);
  }

  function openEditModal(
    user: UserResponse
  ) {
    setEditingUser(user);

    setForm({
      username: user.username,
      password: "",
      role: user.role,
    });

    setFormError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    setEditingUser(null);
    setForm(initialForm);
    setFormError("");
  }

  function updateForm(
    field: keyof UserForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setFormError("");

    if (!form.username.trim()) {
      setFormError(
        "Vui lòng nhập tên đăng nhập."
      );
      return;
    }

    if (
      !editingUser &&
      !form.password.trim()
    ) {
      setFormError(
        "Vui lòng nhập mật khẩu."
      );
      return;
    }

    try {
      setSaving(true);

      if (editingUser) {
        const data: UserUpdate = {
          username:
            form.username.trim(),
          role: form.role,
        };

        if (form.password.trim()) {
          data.password =
            form.password;
        }

        const updated =
          await updateUser(
            editingUser.id,
            data
          );

        setUsers((current) =>
          current.map((item) =>
            item.id === updated.id
              ? updated
              : item
          )
        );
      } else {
        const data: UserCreate = {
          username:
            form.username.trim(),
          password:
            form.password,
          role: form.role,
        };

        const created =
          await createUser(data);

        setUsers((current) => [
          ...current,
          created,
        ]);
      }

      closeModal();
    } catch (err) {
      setFormError(
        getApiErrorMessage(
          err,
          "Không thể lưu tài khoản."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(
    user: UserResponse
  ) {
    const confirmed =
      window.confirm(
        `Xoá tài khoản "${user.username}"?`
      );

    if (!confirmed) return;

    try {
      setDeletingId(user.id);

      await deleteUser(user.id);

      setUsers((current) =>
        current.filter(
          (item) =>
            item.id !== user.id
        )
      );
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          "Không thể xoá tài khoản."
        )
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Quản lý Tài khoản
          </h1>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-md bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700"
        >
          + Thêm tài khoản
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>

          <button
            type="button"
            onClick={loadUsers}
            className="font-semibold underline"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Search & Role Filter Bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm theo tên đăng nhập..."
            className="w-full rounded-md border border-slate-200 px-3.5 py-2 text-sm outline-none focus:border-slate-400 sm:max-w-xs"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as "ALL" | UserRole)}
            className="rounded-md border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-slate-400"
          >
            <option value="ALL">Tất cả vai trò ({users.length})</option>
            <option value="ADMIN">Quản trị viên (ADMIN)</option>
            <option value="EMPLOYEE">Nhân viên (EMPLOYEE)</option>
          </select>
        </div>
        <div className="text-xs font-medium text-slate-500">
          Hiển thị <strong>{filteredUsers.length}</strong> / {users.length} tài khoản
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white ">
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
              Đang tải danh sách tài khoản...
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-2xl">
              👤
            </div>

            <h2 className="font-semibold text-slate-800">
              {users.length === 0
                ? "Chưa có tài khoản nào"
                : "Không tìm thấy tài khoản phù hợp bộ lọc"}
            </h2>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-xs font-semibold   text-slate-500">
                    ID
                  </th>

                  <th className="px-6 py-4 text-xs font-semibold   text-slate-500">
                    Tên đăng nhập
                  </th>

                  <th className="px-6 py-4 text-xs font-semibold   text-slate-500">
                    Vai trò
                  </th>

                  <th className="px-6 py-4 text-right text-xs font-semibold   text-slate-500">
                    Thao tác
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="transition hover:bg-slate-50"
                  >
                    <td className="px-6 py-4 text-sm text-slate-500">
                      #{user.id}
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800">
                        {user.username}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${
                          user.role ===
                          "ADMIN"
                            ? "bg-sky-600 text-white"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {user.role === "ADMIN" ? "Quản trị viên (ADMIN)" : "Nhân viên (EMPLOYEE)"}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openEditModal(
                              user
                            )
                          }
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                        >
                          Sửa
                        </button>

                        <button
                          type="button"
                          disabled={
                            deletingId ===
                            user.id
                          }
                          onClick={() =>
                            handleDelete(
                              user
                            )
                          }
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId ===
                          user.id
                            ? "Đang xoá..."
                            : "Xoá"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingUser
                  ? "Cập nhật tài khoản"
                  : "Thêm tài khoản mới"}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {editingUser
                  ? "Cập nhật thông tin tài khoản và phân quyền."
                  : "Tạo tài khoản đăng nhập mới cho hệ thống."}
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-5 p-4"
            >
              {formError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Tên đăng nhập
                </label>

                <input
                  value={form.username}
                  onChange={(event) =>
                    updateForm(
                      "username",
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                  placeholder="Nhập tên đăng nhập"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Mật khẩu
                </label>

                <input
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    updateForm(
                      "password",
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                  placeholder={
                    editingUser
                      ? "Để trống nếu giữ nguyên mật khẩu hiện tại"
                      : "Nhập mật khẩu"
                  }
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Vai trò
                </label>

                <select
                  value={form.role}
                  onChange={(event) =>
                    updateForm(
                      "role",
                      event.target.value
                    )
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                >
                  <option value="EMPLOYEE">
                    Nhân viên (EMPLOYEE)
                  </option>

                  <option value="ADMIN">
                    Quản trị viên (ADMIN)
                  </option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-md border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Huỷ
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving
                    ? "Đang lưu..."
                    : editingUser
                    ? "Lưu thay đổi"
                    : "Tạo tài khoản"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}