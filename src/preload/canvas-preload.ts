import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC } from '../shared/ipc';
import type { AppState, LinkPreview } from '../shared/types';

contextBridge.exposeInMainWorld('canvasApi', {
  loadState: (): Promise<AppState> => ipcRenderer.invoke(IPC.stateLoad),
  saveState: (state: AppState) => ipcRenderer.send(IPC.stateSave, state),
  hide: () => ipcRenderer.send(IPC.toggleCanvas),
  openLink: (url: string) => ipcRenderer.send(IPC.openLink, url),
  readClipboard: (): Promise<string> => ipcRenderer.invoke(IPC.clipRead),
  getLinkPreview: (url: string): Promise<LinkPreview | null> => ipcRenderer.invoke(IPC.linkPreview, url),
  pickVideo: (): Promise<{ name: string; size: number } | null> => ipcRenderer.invoke(IPC.videoPick),
  importVideo: (srcPath: string): Promise<{ name: string; size: number } | null> =>
    ipcRenderer.invoke(IPC.videoImport, srcPath),
  videoUrl: (name: string): Promise<string | null> => ipcRenderer.invoke(IPC.videoUrl, name),
  forgetVideo: (name: string) => ipcRenderer.send(IPC.videoForget, name),
  openVideo: (content: string) => ipcRenderer.send(IPC.videoOpen, content),
  pathForFile: (file: File): string => webUtils.getPathForFile(file)
});
