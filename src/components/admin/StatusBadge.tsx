export type AdminStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "unconfigured"
  | "success"
  | "failed-upload"
  | "queued"
  | "uploading";

const labels: Record<AdminStatus, string> = {
  pending: "等待分析",
  processing: "分析中",
  completed: "分析完成",
  failed: "分析失败",
  unconfigured: "待配置 AI",
  success: "上传成功",
  "failed-upload": "上传失败",
  queued: "等待上传",
  uploading: "上传中",
};

export function StatusBadge({ status }: { status: AdminStatus }) {
  return <span className={`admin-status admin-status--${status}`}>{labels[status]}</span>;
}
