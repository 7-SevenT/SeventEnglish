export type ToastTone = "success" | "error" | "info";

export function AdminToast({ message, tone = "info", onDismiss }: { message: string; tone?: ToastTone; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div className={`admin-toast admin-toast--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span>{message}</span>
      {onDismiss && <button type="button" className="admin-toast__close" aria-label="关闭提示" onClick={onDismiss}>×</button>}
    </div>
  );
}
