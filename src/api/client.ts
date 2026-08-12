// 会话失效（401）全局事件总线。
// - notifyUnauthorized：apiFetch 收到 401 时通知“已有会话失效”。
// - onUnauthorized：AuthContext 订阅，收到后登出并回登录页（见 src/auth/AuthContext.tsx）。
// 用独立 EventTarget 承载，既避免污染全局 document 事件，也便于 node/测试直接观测；
// 同时派发到 globalThis（浏览器中即 window），兼容外部可能存在的全局监听。
export const AUTH_UNAUTHORIZED_EVENT = "auth:unauthorized";

const authBus = new EventTarget();

export function notifyUnauthorized(): void {
  authBus.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
  if (typeof globalThis.dispatchEvent === "function") {
    globalThis.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
  }
}

export function onUnauthorized(handler: () => void): () => void {
  authBus.addEventListener(AUTH_UNAUTHORIZED_EVENT, handler);
  return () => authBus.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handler);
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // FormData 时浏览器自动带 multipart boundary，不能手动设 Content-Type；否则服务端解析失败。
  const isForm = options.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    headers: isForm
      ? { ...options.headers }
      : { "Content-Type": "application/json", ...options.headers },
    credentials: "same-origin",
    ...options,
  });
  if (res.status === 401) {
    // 全局宣布已有会话失效：由 AuthContext 决定是否登出并回登录页。
    // 注意 POST /api/login 自身返回 401 也会派发此事件，但 AuthContext 仅当
    // authenticated===true 时才响应，登录页场景会被忽略，不打断登录流程。
    notifyUnauthorized();
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error || `请求失败: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {}
export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}
