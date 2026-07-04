import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

/**
 * A topic/category a user asked not to be suggested anymore ("not interested" —
 * §2.9). Distinct from de-duping a single page: this rejects a whole genre.
 * `topic` is the article category label the client mutes (mutable state, so
 * un-muting just deletes the row and the block disappears).
 */
@Entity("blocked_topics")
@Unique(["userId", "topic"])
export class BlockedTopic {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column()
  userId!: string;

  @Column()
  topic!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
