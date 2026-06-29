import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

/** One saved library entry for an account (like / save / share). */
@Entity("library_items")
@Unique(["userId", "articleId", "kind"])
export class LibraryItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column()
  userId!: string;

  @Column()
  articleId!: string;

  /** "like" | "save" | "share". */
  @Column()
  kind!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
