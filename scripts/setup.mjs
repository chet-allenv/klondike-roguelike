#!/usr/bin/env node
// Sets up a fresh clone for local development: verifies Node, installs
// dependencies, and runs a build + test pass so a new machine can confirm
// everything works before touching any code.
import { execSync } from "node:child_process";

const REQUIRED_MAJOR = 20;

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit" });
}

const [major] = process.versions.node.split(".").map(Number);
if (major < REQUIRED_MAJOR) {
  console.error(
    `Node ${process.versions.node} detected. This project requires Node ${REQUIRED_MAJOR}+.\n` +
      "Install a newer version (e.g. via https://nodejs.org/ or nvm) and re-run `npm run setup`.",
  );
  process.exit(1);
}

try {
  run("npm install");
  run("npm run typecheck");
  run("npm run test");

  console.log(
    "\nSetup complete.\n" +
      "  npm run dev     — start the local dev server\n" +
      "  npm run build   — production build\n" +
      "  npm run test    — run the test suite\n",
  );
} catch {
  console.error("\nSetup failed — see the error above.");
  process.exit(1);
}
