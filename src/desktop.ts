export type DocumentData = {
  id: string;
  path: string | null;
  name: string;
  content: string;
  imageBase?: string;
};
export type FileCommand = "new" | "open" | "save" | "saveAs" | "pdf";
declare global {
  interface Window {
    desktop?: {
      current(): Promise<DocumentData>;
      pendingOpenRequests(): Promise<string[]>;
      openRequested(token: string): Promise<DocumentData | null>;
      discardOpenRequest(token: string): Promise<boolean>;
      onOpenRequest(callback: (token: string) => void): () => void;
      create(): Promise<DocumentData>;
      open(): Promise<DocumentData | null>;
      save(
        id: string,
        content: string,
        saveAs?: boolean,
        expectedContent?: string,
      ): Promise<DocumentData | null>;
      confirmSave(): Promise<"save" | "discard" | "cancel">;
      refresh(id: string): Promise<{ changed: boolean; missing: boolean }>;
      reload(id: string): Promise<DocumentData>;
      saveImage(id: string, bytes: Uint8Array): Promise<string>;
      chooseImage(): Promise<Uint8Array | null>;
      chooseBackground(): Promise<string | null>;
      exportPDF(title: string, html: string): Promise<boolean>;
      setDirty(value: boolean): void;
      onFlush(callback: () => void): () => void;
      flushed(ok: boolean): void;
      onCommand(callback: (command: FileCommand) => void): () => void;
    };
  }
}
