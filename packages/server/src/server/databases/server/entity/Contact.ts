import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, JoinTable, Unique } from "typeorm";
import { ContactAddress } from "./ContactAddress";

@Entity({ name: "contact" })
@Unique(["firstName", "lastName"])
export class Contact {
    @PrimaryGeneratedColumn({ name: "id" })
    id: number;

    @Column("text", { name: "first_name", nullable: false })
    firstName: string;

    @Column("text", { name: "last_name", nullable: false })
    lastName: string;

    @OneToMany(() => ContactAddress, contactAddress => contactAddress.contact)
    addresses: ContactAddress[];

    @CreateDateColumn()
    created: Date;

    @UpdateDateColumn()
    updated: Date;
}