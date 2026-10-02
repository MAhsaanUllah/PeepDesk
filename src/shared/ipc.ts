export const IPC = {
  toggleCanvas: 'window:toggle-canvas',
  movePet: 'window:move-pet',
  stateSave: 'state:save',
  stateLoad: 'state:load',
  timerAlert: 'timer:alert',
  timerAction: 'timer:action',
  openLink: 'link:open',
  clipRead: 'clip:read-text',
  linkPreview: 'link:preview',
  videoPick: 'video:pick',
  videoImport: 'video:import',
  videoUrl: 'video:url',
  videoForget: 'video:forget',
  videoOpen: 'video:open'
} as const;
