import { createHash } from "node:crypto";
import { ConnectorExecutionError } from "./errors.js";

export type ConnectorJson = string | number | boolean | null | readonly ConnectorJson[] | { readonly [key: string]: ConnectorJson };

export function connectorHash(value: ConnectorJson): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

export function canonicalJson(value: ConnectorJson): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ConnectorExecutionError("SCHEMA_INVALID", "Connector JSON numbers must be finite");
    return JSON.stringify(value);
  }
  if (isConnectorArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const fields = Object.keys(value).sort().map((key) => {
    const field = value[key];
    if (field === undefined) throw new ConnectorExecutionError("SCHEMA_INVALID", "Connector JSON fields must be defined");
    return `${JSON.stringify(key)}:${canonicalJson(field)}`;
  });
  return `{${fields.join(",")}}`;
}

function isConnectorArray(value: ConnectorJson): value is readonly ConnectorJson[] {
  return Array.isArray(value);
}
