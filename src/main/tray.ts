import { Tray, Menu, app } from 'electron';
import { APP_ICON, togglePet } from './pet-window';
import { toggleCanvas } from './canvas-window';
import { lifecycle } from './app-state';

let tray: Tray | null = null;

export function createTray(): void {
  tray = new Tray(APP_ICON.resize({ width: 16, height: 16 }));
  tray.setToolTip('PeepDesk');
  tray.on('click', () => toggleCanvas());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Canvas', click: () => toggleCanvas() },
      { label: 'Show/Hide Pet', click: togglePet },
      { type: 'separator' },
      {
        label: 'Quit PeepDesk',
        click: () => {
          lifecycle.quitting = true;
          app.quit();
        }
      }
    ])
  );
}
