import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/** A reshared article. Stories older than 24h are filtered out of the feed. */
@Entity("stories")
export class Story {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column()
  userId!: string;

  @Column()
  articleId!: string;

  @Column({ type: "varchar", nullable: true })
  title!: string | null;

  @Column({ type: "varchar", nullable: true })
  image!: string | null;

  @Index()
  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
