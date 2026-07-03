import { SocialService } from "./social.service";
import { DatabaseService } from "../database/database.service";
import { Follow } from "../social/follow.entity";
import { LibraryItem } from "../library/library-item.entity";
import { Story } from "../stories/story.entity";

/** A SocialService over fixed follow/library/story rows. */
function service(opts: {
  follows?: Partial<Follow>[] | null;
  library?: Partial<LibraryItem>[];
  stories?: Partial<Story>[];
}): SocialService {
  const repos = new Map<unknown, { find: jest.Mock } | undefined>([
    [Follow, opts.follows === null ? undefined : { find: jest.fn(async () => opts.follows ?? []) }],
    [LibraryItem, { find: jest.fn(async () => opts.library ?? []) }],
    [Story, { find: jest.fn(async () => opts.stories ?? []) }],
  ]);
  const db = { repo: jest.fn((e: unknown) => repos.get(e)) } as unknown as DatabaseService;
  return new SocialService(db);
}

describe("SocialService.getFollowedTitles", () => {
  it("ranks by social proof (distinct followed accounts)", async () => {
    const svc = service({
      follows: [
        { followerId: "me", followingId: "a", status: "active" },
        { followerId: "me", followingId: "b", status: "active" },
      ],
      library: [
        { userId: "a", articleId: "Popular", kind: "like" },
        { userId: "b", articleId: "Popular", kind: "save" },
        { userId: "a", articleId: "Niche", kind: "like" },
      ],
    });
    expect(await svc.getFollowedTitles("me", 5)).toEqual(["Popular", "Niche"]);
  });

  it("counts stories too", async () => {
    const svc = service({
      follows: [{ followerId: "me", followingId: "a", status: "active" }],
      stories: [{ userId: "a", articleId: "Storied" }],
    });
    expect(await svc.getFollowedTitles("me", 5)).toContain("Storied");
  });

  it("is empty without follows, a user, or a database", async () => {
    expect(await service({ follows: [] }).getFollowedTitles("me", 5)).toEqual([]);
    expect(await service({ follows: [{ followerId: "me", followingId: "a", status: "active" }] }).getFollowedTitles(undefined, 5)).toEqual([]);
    expect(await service({ follows: null }).getFollowedTitles("me", 5)).toEqual([]);
  });
});
