export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiSend<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  return res.json();
}

export const apiPost = <T>(url: string, body: unknown) => apiSend<T>('POST', url, body);
export const apiPatch = <T>(url: string, body: unknown) => apiSend<T>('PATCH', url, body);
export const apiDelete = <T>(url: string, body?: unknown) => apiSend<T>('DELETE', url, body);
