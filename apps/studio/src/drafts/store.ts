import { idbDelete, idbGet, idbKeys, idbSet } from '../storage/idb.ts';
import {
  draftKey,
  isDraftKey,
  DRAFT_PREFIX,
  readDraft,
  type Draft,
} from './draft.ts';

/** Drafts live in the Studio's own IndexedDB store, apart from the OSM cache. */
const STORE = 'drafts' as const;

export async function saveDraft(mapId: string, draft: Draft): Promise<void> {
  await idbSet(STORE, draftKey(mapId), draft);
}

export async function loadDraft(mapId: string): Promise<Draft | null> {
  return readDraft(await idbGet(STORE, draftKey(mapId)));
}

export async function removeDraft(mapId: string): Promise<void> {
  await idbDelete(STORE, draftKey(mapId));
}

/** Every readable draft, newest first. Unreadable entries are skipped. */
export async function listDrafts(): Promise<{ id: string; draft: Draft }[]> {
  const found: { id: string; draft: Draft }[] = [];
  for (const key of (await idbKeys(STORE)).filter(isDraftKey)) {
    const draft = readDraft(await idbGet(STORE, key));
    if (draft) found.push({ id: key.slice(DRAFT_PREFIX.length), draft });
  }
  return found.sort((a, b) => (a.draft.savedAt < b.draft.savedAt ? 1 : -1));
}
