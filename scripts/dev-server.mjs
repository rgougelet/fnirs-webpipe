import path from "node:path";
import { startStaticServer } from "./static-server.mjs";

const argPort = process.argv.find(a => a.startsWith("--port="));
const port = argPort ? Number(argPort.split("=")[1]) : 4173;

const rootDir = path.resolve(process.cwd());
const { url } = await startStaticServer({ rootDir, port });

console.log(`Serving ${rootDir}`);
console.log(`Open: ${url}`);
