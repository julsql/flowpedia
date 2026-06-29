import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

/** An Expo push token for one device. A token is globally unique and reassigned
 *  to whichever account last registered it (one device, one logged-in account). */
@Entity("push_tokens")
@Unique(["token"])
export class PushToken {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column()
  userId!: string;

  @Column()
  token!: string;

  @Column({ type: "varchar", nullable: true })
  platform!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
