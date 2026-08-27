import { ConnectorDescriptorSchema, type ConnectorDescriptor } from "@nexora/contracts";

export class ConnectorRegistryError extends Error {
  readonly name = "ConnectorRegistryError";
}

export class ConnectorRegistry {
  private readonly descriptors = new Map<string, ConnectorDescriptor>();

  register(descriptor: ConnectorDescriptor): void {
    const parsed = ConnectorDescriptorSchema.parse(descriptor);
    const key = descriptorKey(parsed.id, parsed.version);
    if (this.descriptors.has(key)) throw new ConnectorRegistryError(`Connector ${key} is already registered`);
    this.descriptors.set(key, parsed);
  }

  get(id: string, version: string): ConnectorDescriptor | undefined {
    return this.descriptors.get(descriptorKey(id, version));
  }

  list(): readonly ConnectorDescriptor[] {
    return [...this.descriptors.values()].sort((left, right) => descriptorKey(left.id, left.version).localeCompare(descriptorKey(right.id, right.version)));
  }
}

function descriptorKey(id: string, version: string): string {
  return `${id}@${version}`;
}
