import { previewApi } from "./preview";
export const browserMode = import.meta.env.VITE_API_MODE !== "backend";
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (browserMode) return previewApi<T>(path, body);
  const response = await fetch(
    "/api" + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : JSON.stringify(error.detail),
    );
  }
  return response.json() as Promise<T>;
}
