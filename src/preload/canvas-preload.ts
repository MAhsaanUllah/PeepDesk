import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AppState, LinkPreview } from '../shared/types';

// Channel names inlined: sandboxed Electron preloads cannot require relative
// local modules (see Electron's sandboxed_renderer/preload.ts module resolver).
const IPC = {
  toggleCanvas: 'window:toggle-canvas',
  stateSave: 'state:save',
  stateLoad: 'state:load',
  openLink: 'link:open',
  clipRead: 'clip:read-text',
  linkPreview: 'link:preview',
  imagePick: 'image:pick',
  imageImport: 'image:import',
  imageUrl: 'image:url',
  videoPick: 'video:pick',
  videoImport: 'video:import',
  videoUrl: 'video:url',
  videoForget: 'video:forget',
  videoOpen: 'video:open',
  boardsList: 'boards:list',
  boardCreate: 'boards:create',
  boardRename: 'boards:rename',
  boardArchive: 'boards:archive',
  boardRestore: 'boards:restore',
  boardSwitch: 'boards:switch',
  boardDocumentExport: 'boards:document-export',
  boardDocumentImport: 'boards:document-import'
} as const;

contextBridge.exposeInMainWorld('canvasApi', {
  loadState: (): Promise<AppState> => ipcRenderer.invoke(IPC.stateLoad),
  saveState: (state: AppState) => ipcRenderer.send(IPC.stateSave, state),
  hide: () => ipcRenderer.send(IPC.toggleCanvas),
  openLink: (url: string) => ipcRenderer.send(IPC.openLink, url),
  readClipboard: (): Promise<string> => ipcRenderer.invoke(IPC.clipRead),
  getLinkPreview: (url: string): Promise<LinkPreview | null> => ipcRenderer.invoke(IPC.linkPreview, url),
  pickImage: (): Promise<{ name: string; size: number } | null> =>
    ipcRenderer.invoke(IPC.imagePick),
  importImage: (srcPath: string): Promise<{ name: string; size: number } | null> =>
    ipcRenderer.invoke(IPC.imageImport, srcPath),
  imageUrl: (name: string): Promise<string | null> => ipcRenderer.invoke(IPC.imageUrl, name),
  pickVideo: (): Promise<{ name: string; size: number } | null> =>
    ipcRenderer.invoke(IPC.videoPick),
  importVideo: (srcPath: string): Promise<{ name: string; size: number } | null> =>
    ipcRenderer.invoke(IPC.videoImport, srcPath),
  videoUrl: (name: string): Promise<string | null> => ipcRenderer.invoke(IPC.videoUrl, name),
  forgetVideo: (name: string) => ipcRenderer.send(IPC.videoForget, name),
  openVideo: (content: string) => ipcRenderer.send(IPC.videoOpen, content),
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  testMockDialog: (targetPath: string | null): Promise<boolean> =>
    ipcRenderer.invoke('__test:mock-dialog', targetPath),
  previewTestSetDns: (map: Record<string, string | string[]> | null): Promise<boolean> =>
    ipcRenderer.invoke('__test:preview-dns', map),
  previewTestConnCount: (): Promise<number> => ipcRenderer.invoke('__test:preview-conns'),
  previewTestProbe: (raw: string): Promise<{ ok: boolean; ip?: string; family?: number; blocked?: string }> =>
    ipcRenderer.invoke('__test:preview-probe', raw),
  previewTestRaw: (raw: string): Promise<unknown> => ipcRenderer.invoke('__test:preview-raw', raw),
  previewTestReset: (): Promise<boolean> => ipcRenderer.invoke('__test:preview-reset'),
  boardsList: (): Promise<unknown> => ipcRenderer.invoke(IPC.boardsList),
  boardCreate: (name: string): Promise<unknown> => ipcRenderer.invoke(IPC.boardCreate, name),
  boardRename: (id: string, name: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC.boardRename, id, name),
  boardArchive: (id: string): Promise<unknown> => ipcRenderer.invoke(IPC.boardArchive, id),
  boardRestore: (id: string): Promise<unknown> => ipcRenderer.invoke(IPC.boardRestore, id),
  boardSwitch: (id: string): Promise<unknown> => ipcRenderer.invoke(IPC.boardSwitch, id),
  boardDocumentExport: (): Promise<unknown> => ipcRenderer.invoke(IPC.boardDocumentExport),
  boardDocumentImport: (doc: unknown): Promise<unknown> =>
    ipcRenderer.invoke(IPC.boardDocumentImport, doc)
});
