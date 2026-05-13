/**
 * API client for me3
 */

// Use relative /api by default so OSS installs do not point at ME3 Cloud.
export const API_BASE = import.meta.env.VITE_API_BASE || '/api'
export const USERNAME_AVAILABILITY_API_BASE =
  import.meta.env.VITE_USERNAME_AVAILABILITY_API_BASE || 'https://api.me3.app/api'

function sanitizeErrorMessage(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const trimmed = raw.trim()
  if (!trimmed) return fallback

  const looksLikeHtml =
    /^<!doctype html>/i.test(trimmed) ||
    /^<html[\s>]/i.test(trimmed) ||
    /<body[\s>]/i.test(trimmed)

  if (!looksLikeHtml) return trimmed

  const titleMatch = trimmed.match(/<title>(.*?)<\/title>/i)
  const title = titleMatch?.[1]?.trim()
  return title || 'Unexpected server response'
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {}

  // Copy existing headers if any
  if (options.headers) {
    const existingHeaders = options.headers as Record<string, string>
    Object.assign(headers, existingHeaders)
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  const text = await response.text()
  const data = text
    ? (() => {
        try {
          return JSON.parse(text)
        } catch {
          return { error: text }
        }
      })()
    : {}

  if (!response.ok) {
    throw new ApiError(
      sanitizeErrorMessage(data.error, 'Request failed'),
      response.status
    )
  }

  return data as T
}

function apiUrl(base: string, endpoint: string): string {
  return `${base.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`
}

export async function getUsernameAvailability(username: string): Promise<boolean> {
  const response = await fetch(
    apiUrl(
      USERNAME_AVAILABILITY_API_BASE,
      `/usernames/${encodeURIComponent(username)}/available`
    ),
    {
      method: 'GET',
      credentials: 'include',
    }
  )

  const text = await response.text()
  const data = text
    ? (() => {
        try {
          return JSON.parse(text)
        } catch {
          return { error: text }
        }
      })()
    : {}

  if (!response.ok) {
    throw new ApiError(
      sanitizeErrorMessage(data.error, 'Username availability check failed'),
      response.status
    )
  }

  return data.available === true
}

export const api = {
  get<T>(endpoint: string): Promise<T> {
    return request<T>(endpoint, { method: 'GET' })
  },

  post<T>(endpoint: string, body?: unknown, options: RequestInit = {}): Promise<T> {
    return request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  put<T>(endpoint: string, body?: unknown): Promise<T> {
    return request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  },

  patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  },

  delete<T>(endpoint: string): Promise<T> {
    return request<T>(endpoint, { method: 'DELETE' })
  },

  upload<T>(endpoint: string, formData: FormData): Promise<T> {
    return fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    }).then(async (response) => {
      const text = await response.text()
      const data = text
        ? (() => {
            try {
              return JSON.parse(text)
            } catch {
              return { error: text }
            }
          })()
        : {}
      if (!response.ok) {
        throw new ApiError(
          sanitizeErrorMessage(data.error, 'Upload failed'),
          response.status
        )
      }
      return data as T
    })
  },
}
