import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/** A persisted user signal — the raw material for the recommendation algorithm. */
@Entity("interactions")
export class Interaction {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "varchar", nullable: true })
  userId!: string | null;

  @Index()
  @Column()
  articleId!: string;

  @Index()
  @Column()
  type!: string;

  @Column({ type: "double precision", nullable: true })
  value!: number | null;

  /** Client-side epoch ms. */
  @Column({ type: "bigint" })
  ts!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
