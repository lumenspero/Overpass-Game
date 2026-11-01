import { createStore, del, get, keys, set } from 'idb-keyval';
import {
  draftKey,
  isDraftKey,
  DRAFT_PREFIX,
  readDraft,
  type Draft,
} from './draft.ts';

/** IndexedDB store for drafts, kept apart from the OSM cache. */
const store = createStore('overpass_game_studio', 'drafts');

export async function saveDraft(mapId: string, draft: Draft): Promise<void> {
  await set(draftKey(mapId), draft, store);
}

export async function loadDraft(mapId: string): Promise<Draft | null> {
  return readDraft(await get(draftKey(mapId), store));
}

export async function removeDraft(mapId: string): Promise<void> {
  await del(draftKey(mapId), store);
}

/** Every readable draft, newest first. Unreadable entries are skipped. */
export async function listDrafts(): Promise<{ id: string; draft: Draft }[]> {
  const found: { id: string; draft: Draft }[] = [];
  for (const key of (await keys(store)).filter(isDraftKey)) {
    const draft = readDraft(await get(key, store));
    if (draft) found.push({ id: key.slice(DRAFT_PREFIX.length), draft });
  }
  return found.sort((a, b) => (a.draft.savedAt < b.draft.savedAt ? 1 : -1));
}
