import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/** A direct message from one account to another: either a shared page (article)
 *  with an optional note, or a plain text message (no article). */
@Entity("page_messages")
export class PageMessage {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column()
  fromUserId!: string;

  @Index()
  @Column()
  toUserId!: string;

  /** The shared article, or null for a plain text message. */
  @Column({ type: "varchar", nullable: true })
  articleId!: string | null;

  @Column({ type: "varchar", nullable: true })
  title!: string | null;

  @Column({ type: "varchar", nullable: true })
  image!: string | null;

  @Column({ type: "varchar", nullable: true })
  note!: string | null;

  @Column({ default: false })
  read!: boolean;

  @Index()
  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
