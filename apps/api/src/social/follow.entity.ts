import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

/** A directed follow edge. `pending` when the target is private and hasn't
 *  approved yet; `active` once it's a real follow. */
@Entity("follows")
@Unique(["followerId", "followingId"])
export class Follow {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column()
  followerId!: string;

  @Index()
  @Column()
  followingId!: string;

  /** "active" | "pending". */
  @Column({ default: "active" })
  status!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
