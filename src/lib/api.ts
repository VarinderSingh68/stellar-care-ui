import { API_CONFIG } from "./config";

// Session tokens issued by the backend (see server/auth.cjs). The admin
// token lives in sessionStorage (signed out when the tab closes, matching
// the previous admin session behaviour); the patient token lives in
// localStorage so a patient stays signed in across visits, matching the
// previous "cardiovita.patient-auth" behaviour.
const ADMIN_TOKEN_KEY = "clinic.admin.token";
const PATIENT_TOKEN_KEY = "clinic.patient.token";

const hasWindow = () => typeof window !== "undefined";

export const getAdminToken = (): string | null => (hasWindow() ? sessionStorage.getItem(ADMIN_TOKEN_KEY) : null);
export const setAdminToken = (token: string) => {
  if (hasWindow()) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
};
export const clearAdminToken = () => {
  if (hasWindow()) sessionStorage.removeItem(ADMIN_TOKEN_KEY);
};
export const isAdminAuthenticated = () => Boolean(getAdminToken());

export const getPatientToken = (): string | null => (hasWindow() ? localStorage.getItem(PATIENT_TOKEN_KEY) : null);
export const setPatientToken = (token: string) => {
  if (hasWindow()) localStorage.setItem(PATIENT_TOKEN_KEY, token);
};
export const clearPatientToken = () => {
  if (hasWindow()) localStorage.removeItem(PATIENT_TOKEN_KEY);
};
export const isPatientAuthenticated = () => Boolean(getPatientToken());

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const isAuthError = (error: unknown): error is ApiError => error instanceof ApiError && error.status === 401;

type TokenKind = "admin" | "patient" | "none";

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  tokenKind?: TokenKind;
  body?: unknown;
}

const dispatchWindowEvent = (eventName: string) => {
  if (hasWindow()) window.dispatchEvent(new Event(eventName));
};

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { tokenKind = "none", headers, body, ...rest } = options;
  const token = tokenKind === "admin" ? getAdminToken() : tokenKind === "patient" ? getPatientToken() : null;

  const finalHeaders: Record<string, string> = {
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...((headers as Record<string, string>) || {}),
  };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_CONFIG.baseUrl}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
      throw new ApiError("Could not connect to the server. Please check your connection and try again.", 0);
    }
    throw error;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.message || `Request failed (${response.status}).`;
    if (response.status === 401 && tokenKind === "admin") clearAdminToken();
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export const apiGet = <T>(path: string, tokenKind: TokenKind = "none") => apiFetch<T>(path, { method: "GET", tokenKind });

export const apiPost = <T>(path: string, body: unknown, tokenKind: TokenKind = "none") =>
  apiFetch<T>(path, { method: "POST", body, tokenKind });

export const apiPut = <T>(path: string, body: unknown, tokenKind: TokenKind = "none") =>
  apiFetch<T>(path, { method: "PUT", body, tokenKind });

export const apiPatch = <T>(path: string, body: unknown, tokenKind: TokenKind = "none") =>
  apiFetch<T>(path, { method: "PATCH", body, tokenKind });

export { dispatchWindowEvent };
