import type { StoredNote } from "./storage";
import type { UpdateState } from "./UpdatesPanel";
export type DesktopData = {
  id: string;
  name: string;
  root: string;
  paths: Record<string, string>;
  notes: StoredNote[];
  folders: string[];
};
declare global {
  interface Window {
    desktop?: {
      platform: string;
      chooseBackground(): Promise<string | null>;
      updateState(): Promise<UpdateState>;
      checkUpdates(): Promise<UpdateState>;
      downloadUpdate(): Promise<UpdateState>;
      installUpdate(): Promise<void>;
      automaticUpdates(value: boolean): Promise<UpdateState>;
      onUpdate(callback: (state: UpdateState) => void): () => void;
      restore(): Promise<DesktopData>;
      open(): Promise<DesktopData | null>;
      save(
        id: string,
        notes: StoredNote[],
      ): Promise<{ paths: Record<string, string> }>;
      renameNote(
        id: string,
        noteId: string,
        title: string,
      ): Promise<{ paths: Record<string, string> }>;
      createFolder(id: string, folder: string): Promise<void>;
      moveFolder(
        id: string,
        from: string,
        to: string,
      ): Promise<{ paths: Record<string, string> }>;
      deleteFolder(
        id: string,
        folder: string,
      ): Promise<{ paths: Record<string, string> }>;
      exportPDF(title: string, html: string): Promise<boolean>;
      exportNote(title: string, content: string): Promise<boolean>;
      reveal(id: string): Promise<void>;
      setDirty(value: boolean): void;
      onFlush(callback: () => void): () => void;
      flushed(ok: boolean, error?: string): void;
    };
  }
}
export class DesktopWorkspace {
  readonly root: { name: string };
  readonly id: string;
  readonly fullPath: string;
  private paths: Record<string, string>;
  constructor(readonly data: DesktopData) {
    this.root = { name: data.name };
    this.id = data.id;
    this.fullPath = data.root;
    this.paths = data.paths;
  }
  async load() {
    return { notes: this.data.notes, folders: this.data.folders };
  }
  pathFor(id: string) {
    return this.paths[id];
  }
  async save(notes: StoredNote[]) {
    const result = await window.desktop!.save(this.id, notes);
    this.paths = result.paths;
  }
  async renameNote(id: string, title: string) {
    this.paths = (await window.desktop!.renameNote(this.id, id, title)).paths;
  }
  createFolder(path: string) {
    return window.desktop!.createFolder(this.id, path);
  }
  async moveFolder(from: string, to: string) {
    this.paths = (await window.desktop!.moveFolder(this.id, from, to)).paths;
  }
  async deleteFolder(folder: string) {
    this.paths = (await window.desktop!.deleteFolder(this.id, folder)).paths;
  }
}
