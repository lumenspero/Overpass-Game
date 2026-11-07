import type { PlacementReport } from '../audio/action-sounds.ts';
import type { Tool } from '../input/intents.ts';

/** Tools that place one piece and then hand back to the default tool. */
const PLACEMENT_TOOLS: ReadonlySet<Tool> = new Set<Tool>([
  'bridge',
  'tunnel',
  'motorway',
  'roundabout',
  'light',
]);

/**
 * The tool after one input. A placement tool is used once: when a new placement report comes back
 * built, the default tool, which draws road on a drag, comes back. A refused placement keeps the
 * tool for another try, and every other tool stays as it is.
 */
export function toolAfterPlacement(
  tool: Tool,
  before: PlacementReport | null,
  after: PlacementReport | null,
): Tool {
  const placed = after?.ok === true && after.seq !== before?.seq;
  return placed && PLACEMENT_TOOLS.has(tool) ? 'select' : tool;
}
