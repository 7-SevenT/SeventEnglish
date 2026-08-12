import { useState } from "react";
import { CircleNotch, CloudArrowDown, CloudArrowUp } from "@phosphor-icons/react";
import { apiFetch } from "../api/client";
import { ConfirmDialog } from "./ConfirmDialog";

type Toast = { type: "success" | "error"; message: string };

export function WebdavBackup({ iconOnly = false }: { iconOnly?: boolean }) {
  const [busy, setBusy] = useState<"backup" | "restore" | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (type: Toast["type"], message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4000);
  };

  const handleBackup = async () => {
    setBusy("backup");
    try {
      await apiFetch("/backup", { method: "POST", body: "{}" });
      showToast("success", "已备份到 WebDAV");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "备份失败");
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    setBusy("restore");
    try {
      await apiFetch("/backup/restore", { method: "POST", body: "{}" });
      showToast("success", "已从 WebDAV 恢复");
      setConfirmRestore(false);
      window.location.reload();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "恢复失败");
      setConfirmRestore(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className={iconOnly ? "nav-actions__group" : "nav-actions__group nav-actions__group--text"}>
        <button
          onClick={handleBackup}
          disabled={busy !== null}
          title="云端备份"
          aria-label="云端备份"
          className={iconOnly ? "nav-icon-btn" : "btn btn--ghost"}
        >
          {busy === "backup" ? (
            <CircleNotch size={iconOnly ? 20 : 16} className="spin" />
          ) : (
            <CloudArrowUp size={iconOnly ? 20 : 16} />
          )}
          {!iconOnly && (busy === "backup" ? "备份中..." : "云端备份")}
        </button>
        <button
          onClick={() => setConfirmRestore(true)}
          disabled={busy !== null}
          title="云端恢复"
          aria-label="云端恢复"
          className={iconOnly ? "nav-icon-btn" : "btn btn--ghost"}
        >
          {busy === "restore" ? (
            <CircleNotch size={iconOnly ? 20 : 16} className="spin" />
          ) : (
            <CloudArrowDown size={iconOnly ? 20 : 16} />
          )}
          {!iconOnly && (busy === "restore" ? "恢复中..." : "云端恢复")}
        </button>
      </div>

      <ConfirmDialog
        open={confirmRestore}
        title="从 WebDAV 恢复"
        description="将从 WebDAV 拉取备份并覆盖本地全部数据，此操作不可撤销。确定继续吗？"
        confirmLabel="确认恢复"
        onConfirm={() => void handleRestore()}
        onCancel={() => setConfirmRestore(false)}
      />

      {toast && (
        <div className={`toast ${toast.type === "error" ? "toast--error" : "toast--success"}`} role="status">
          {toast.message}
        </div>
      )}
    </>
  );
}
