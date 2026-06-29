import type { StoryGroup } from "@flowpedia/shared";

/** Most recent story timestamp in a group (items come back newest-first). */
export function latestAt(group: StoryGroup): number {
  return group.items.reduce((max, it) => Math.max(max, Date.parse(it.createdAt) || 0), 0);
}

/** Bar/viewer ordering: groups with unseen stories first (leftmost), each block
 *  ordered by most-recent story. So a fresh reshare from someone you'd fully seen
 *  pops back to the front. `hasUnseen` comes from the SeenStories context. */
export function sortStoryGroups(
  groups: StoryGroup[],
  hasUnseen: (g: StoryGroup) => boolean,
): StoryGroup[] {
  return [...groups].sort((a, b) => {
    const ua = hasUnseen(a) ? 1 : 0;
    const ub = hasUnseen(b) ? 1 : 0;
    if (ua !== ub) return ub - ua;
    return latestAt(b) - latestAt(a);
  });
}
