export type StatusTone = "info" | "success" | "warning" | "danger" | "muted";

export type StatusToken = {
  readonly label: string;
  readonly className: string;
  readonly iconLabel: string;
};

export const statusTokens: Record<StatusTone, StatusToken> = {
  danger: { label: "Needs action", className: "status-badge status-badge--danger", iconLabel: "Danger" },
  info: { label: "Informational", className: "status-badge status-badge--info", iconLabel: "Info" },
  muted: { label: "Unavailable", className: "status-badge status-badge--muted", iconLabel: "Unavailable" },
  success: { label: "Verified", className: "status-badge status-badge--success", iconLabel: "Success" },
  warning: { label: "Review required", className: "status-badge status-badge--warning", iconLabel: "Warning" },
};

export function statusClassForTone(tone: StatusTone): string {
  return statusTokens[tone].className;
}
