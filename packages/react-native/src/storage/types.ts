export interface StorageAdapter {
  id: string;
  label: string;
  /**
   * The values in this backend are secrets. The panel masks them until the
   * reader explicitly reveals one. Absent means ordinary app data.
   */
  sensitive?: boolean;
  list(): Promise<string[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
