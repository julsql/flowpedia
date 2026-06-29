import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/** One in-app notification for a recipient. Actors/articles are stored as plain
 *  id columns (no FK relations, matching the rest of the schema). */
@Entity("notifications")
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column()
  recipientId!: string;

  /** Who triggered it. */
  @Column()
  actorId!: string;

  /** NotificationType: "follow_request" | "follow_accepted" | "follower" | "page_received". */
  @Column()
  type!: string;

  /** Set for page_received. */
  @Column({ type: "varchar", nullable: true })
  articleId!: string | null;

  @Column({ type: "varchar", nullable: true })
  title!: string | null;

  @Column({ default: false })
  read!: boolean;

  @Index()
  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
