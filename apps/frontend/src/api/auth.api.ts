import apiClient from "./client";
import type { Profile, ProfileUpdate } from "../types/user";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginUser {
  id: number;
  username: string;
  role: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: LoginUser;
}

export interface StoreProfile {
  id: number;
  store_name: string;
  company_name?: string | null;
  tax_code?: string | null;
  business_type: string;
  employee_scale?: string;
  branch_count?: number;
  service_plan?: string;
  business_email?: string | null;
  representative_name?: string | null;
  representative_title?: string | null;
  address: string | null;
  phone: string | null;
  default_hourly_rate: number;
  late_tolerance_minutes: number;
  min_face_similarity: number;
  owner_user_id: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface StoreProfileUpdatePayload {
  store_name: string;
  company_name?: string | null;
  tax_code?: string | null;
  business_type: string;
  employee_scale?: string;
  branch_count?: number;
  service_plan?: string;
  business_email?: string | null;
  representative_name?: string | null;
  representative_title?: string | null;
  address?: string | null;
  phone?: string | null;
  default_hourly_rate: number;
  late_tolerance_minutes: number;
  min_face_similarity: number;
}

export interface StoreRegisterPayload {
  store_name: string;
  company_name: string;
  tax_code: string;
  business_type: string;
  employee_scale: string;
  branch_count: number;
  service_plan: string;
  business_email?: string | null;
  representative_title?: string | null;
  address: string;
  phone: string;
  default_hourly_rate: number;
  late_tolerance_minutes: number;
  min_face_similarity: number;
  admin_full_name: string;
  admin_email: string;
  admin_username: string;
  admin_password: string;
}

export interface StoreRegisterResponse {
  access_token: string;
  token_type: string;
  user: LoginUser;
  store: StoreProfile;
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>("/api/auth/login", data);
  return response.data;
}

export async function logout(): Promise<void> {
  await apiClient.post("/api/auth/logout");
}

export async function getStoreProfile(): Promise<StoreProfile> {
  const response = await apiClient.get<StoreProfile>("/api/auth/store-profile");
  return response.data;
}

export async function updateStoreProfile(
  data: StoreProfileUpdatePayload
): Promise<StoreProfile> {
  const response = await apiClient.put<StoreProfile>(
    "/api/auth/store-profile",
    data
  );
  return response.data;
}

export async function registerStore(
  data: StoreRegisterPayload
): Promise<StoreRegisterResponse> {
  const response = await apiClient.post<StoreRegisterResponse>(
    "/api/auth/register-store",
    data
  );
  return response.data;
}

export async function getProfile(): Promise<Profile> {
  const response = await apiClient.get<Profile>("/api/profile");
  return response.data;
}

export async function updateProfile(data: ProfileUpdate): Promise<Profile> {
  const response = await apiClient.put<Profile>("/api/profile", data);
  return response.data;
}

export async function uploadProfileAvatar(file: File): Promise<Profile> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post<Profile>(
    "/api/profile/avatar",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    }
  );
  return response.data;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export async function changePassword(
  data: ChangePasswordPayload
): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>(
    "/api/auth/change-password",
    data
  );
  return response.data;
}
