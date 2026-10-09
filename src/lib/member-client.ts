export const memberApi = "/_emdash/api/plugins/duanap-members/";
/** Host JSON envelope and the source auth/status envelope are both retained. */
export async function memberRequest<T>(
  path: string,
  input?: object,
): Promise<T> {
  const json = input && path !== "auth/logout";
  const response = await fetch(memberApi + path, {
    method: input ? "POST" : "GET",
    headers: json ? { "Content-Type": "application/json" } : {},
    body: json ? JSON.stringify(input) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const envelope = await response.json();
  if (!response.ok || !envelope.success) throw new Error("request_failed");
  return envelope.data?.success === true ? envelope.data.data : envelope.data;
}
