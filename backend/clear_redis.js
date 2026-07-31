import { getRedisClient } from "./app/config/redis.js";
import dotenv from "dotenv";
dotenv.config();

async function clear() {
  const client = await getRedisClient();
  if (client) {
    console.log("Flushing redis...");
    await client.flushAll();
    console.log("Done");
    process.exit(0);
  } else {
    console.log("No redis client");
    process.exit(0);
  }
}
clear();
