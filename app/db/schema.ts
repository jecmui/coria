import { pgTable, uuid, varchar, text } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
    user_id: uuid("user_id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    username: varchar("username", { length: 50 }).notNull().unique(),
    password: text("password").notNull(),
});
export type User = typeof users.$inferSelect;
