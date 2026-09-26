const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

export function audioUrl(path) {
  return `${API_URL}${path}`;
}

export { API_URL };
