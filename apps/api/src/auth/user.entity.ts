import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/** A registered account. The password is only ever stored hashed (bcrypt). */
@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Stored lowercased; unique. */
  @Index({ unique: true })
  @Column({ unique: true })
  email!: string;

  /** Unique handle, stored lowercased (e.g. "julsql"). */
  @Index({ unique: true })
  @Column({ unique: true })
  username!: string;

  /** Pretty name shown in the UI; defaults to the username. */
  @Column()
  displayName!: string;

  @Column()
  passwordHash!: string;

  /** Private accounts gate their followers/stories behind approval. */
  @Column({ default: false })
  isPrivate!: boolean;

  /** bcrypt hash of the current password-reset token, or null when none is active. */
  @Column({ type: "varchar", nullable: true })
  passwordResetTokenHash!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  passwordResetExpires!: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
