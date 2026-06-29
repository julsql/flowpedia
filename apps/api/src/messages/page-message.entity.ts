import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/** A page (article) sent directly from one account to another (lightweight DM). */
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

  @Column()
  articleId!: string;

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
