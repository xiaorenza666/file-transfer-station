import "dotenv/config";
import * as db from "./server/db";

async function check() {
  try {
    const dl = await db.getSystemConfig("downloadSpeedLimit");
    const ul = await db.getSystemConfig("uploadSpeedLimit");
    console.log("Download Limit Config:", dl);
    console.log("Upload Limit Config:", ul);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

check();
