import type { MenuChoice } from '../ui/menu.ts';

/**
 * What the end-of-run screen can ask the app to do: go back to the menu, or play a map. The app
 * sets these at start-up, so the scene never imports the app's start-up code.
 */
export interface RunActions {
  menu(): void;
  play(choice: MenuChoice): void;
}

let actions: RunActions | null = null;

export function setRunActions(next: RunActions): void {
  actions = next;
}

export function runActions(): RunActions | null {
  return actions;
}
