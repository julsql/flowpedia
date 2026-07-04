import { Column, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";

/**
 * Cached embedding of an article (Phase 2, §5). Stored as JSON (portable — no
 * pgvector extension needed) since we cosine-rank a small candidate set in JS
 * rather than run full-corpus ANN. Shared across users: one row per
 * article/language/model, so cost scales with the consulted corpus, not users.
 */
@Entity("article_embeddings")
@Unique(["articleId", "lang", "model"])
export class ArticleEmbedding {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column()
  articleId!: string;

  @Column()
  lang!: string;

  @Column()
  model!: string;

  @Column({ type: "int" })
  dim!: number;

  @Column({ type: "simple-json" })
  vec!: number[];

  @UpdateDateColumn()
  updatedAt!: Date;
}
