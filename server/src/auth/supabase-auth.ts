export class SupabaseAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseAuthConfigurationError';
  }
}

export interface SupabaseAuthUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  banned_until?: string | null;
}

export interface SupabaseAuthUserAttributes {
  email: string;
  password?: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

export interface SupabaseAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: SupabaseAuthUser;
}

export interface SupabaseAuthAdapter {
  verifyAccessToken(accessToken: string): Promise<SupabaseAuthUser | null>;
  signInWithPassword(email: string, password: string): Promise<SupabaseAuthSession>;
  changePassword(accessToken: string, password: string): Promise<void>;
  createUser(attributes: SupabaseAuthUserAttributes): Promise<SupabaseAuthUser>;
  inviteUser(email: string, options?: { userMetadata?: Record<string, unknown>; redirectTo?: string }): Promise<SupabaseAuthUser>;
  updateUser(id: string, attributes: Partial<SupabaseAuthUserAttributes> & { ban_duration?: string }): Promise<SupabaseAuthUser>;
  deleteUser(id: string, options?: { shouldSoftDelete?: boolean }): Promise<void>;
  sendPasswordReset(email: string, redirectTo: string): Promise<void>;
}

interface AdapterOptions {
  url: string;
  publishableKey: string;
  secretKey?: string;
  fetchImpl?: typeof fetch;
}

function parseError(status: number, body: string): Error {
  let message = body || `Supabase Auth request failed (${status})`;
  try {
    const parsed = JSON.parse(body) as { msg?: string; message?: string; error_description?: string };
    message = parsed.msg || parsed.message || parsed.error_description || message;
  } catch {
    // Keep the raw response when Supabase did not return JSON.
  }
  return new Error(`Supabase Auth ${status}: ${message}`);
}

export function createSupabaseAuthAdapter(options: AdapterOptions): SupabaseAuthAdapter {
  const url = options.url.trim().replace(/\/$/, '');
  const publishableKey = options.publishableKey.trim();
  const secretKey = options.secretKey?.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!url || !publishableKey) {
    throw new SupabaseAuthConfigurationError('Thiếu SUPABASE_URL hoặc SUPABASE_PUBLISHABLE_KEY.');
  }

  async function request<T>(path: string, init: RequestInit, key: string, bearer?: string): Promise<T> {
    const response = await fetchImpl(`${url}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apikey: key,
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    const body = await response.text();
    if (!response.ok) throw parseError(response.status, body);
    if (!body) return undefined as T;
    return JSON.parse(body) as T;
  }

  function adminKey(): string {
    if (!secretKey) throw new SupabaseAuthConfigurationError('Thiếu SUPABASE_SECRET_KEY cho tác vụ quản trị Auth.');
    return secretKey;
  }

  return {
    async verifyAccessToken(accessToken) {
      if (!accessToken.trim()) return null;
      try {
        return await request<SupabaseAuthUser>('/auth/v1/user', { method: 'GET' }, publishableKey, accessToken);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Supabase Auth 401:')) return null;
        throw error;
      }
    },
    async signInWithPassword(email, password) {
      const response = await request<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
        user: SupabaseAuthUser;
      }>('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }, publishableKey);
      return {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        expiresIn: response.expires_in,
        user: response.user,
      };
    },
    async changePassword(accessToken, password) {
      await request<void>('/auth/v1/user', {
        method: 'PUT',
        body: JSON.stringify({ password }),
      }, publishableKey, accessToken);
    },
    createUser(attributes) {
      return request<SupabaseAuthUser>('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify(attributes) }, adminKey(), adminKey());
    },
    inviteUser(email, options = {}) {
      return request<SupabaseAuthUser>('/auth/v1/invite', {
        method: 'POST',
        body: JSON.stringify({
          email,
          ...(options.userMetadata ? { data: options.userMetadata } : {}),
          ...(options.redirectTo ? { redirect_to: options.redirectTo } : {}),
        }),
      }, adminKey(), adminKey());
    },
    updateUser(id, attributes) {
      return request<SupabaseAuthUser>(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(attributes) }, adminKey(), adminKey());
    },
    async deleteUser(id, options = {}) {
      const query = options.shouldSoftDelete ? '?should_soft_delete=true' : '';
      await request<void>(`/auth/v1/admin/users/${encodeURIComponent(id)}${query}`, { method: 'DELETE' }, adminKey(), adminKey());
    },
    async sendPasswordReset(email, redirectTo) {
      await request<void>('/auth/v1/recover', { method: 'POST', body: JSON.stringify({ email, redirect_to: redirectTo }) }, publishableKey);
    },
  };
}
