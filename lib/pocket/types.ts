export interface PocketUser {
  id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  profile_image_url: string | null;
  auth_provider: string;
  onboarding_status: string | null;
  role: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
  email_verified: boolean;
  email_verified_at: string | null;
  last_login_at: string | null;
  last_login_method: string | null;
  subscription_type: string | null;
  app_version: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
  devices: PocketDevice[];
}

export interface PocketUserResponse {
  user: PocketUser | null;
  found: boolean;
}

export interface PocketDevice {
  id: string;
  user_id: string;
  device_id: string | null;
  serial_number: string | null;
  mac_address: string | null;
  model_string: string | null;
  firmware_version: string | null;
  wifi_firmware_version: string | null;
  last_synced_file: string | null;
  last_synced_folder: string | null;
  last_sync_time: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export class PocketApiError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "PocketApiError";
  }
}
