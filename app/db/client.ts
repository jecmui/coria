import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);

export default client;
