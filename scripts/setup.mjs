import { spawn } from "node:child_process";

function run(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: true,
      stdio: "inherit",
    });

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Comando falhou: ${command} ${args.join(" ")}`));
    });
  });
}

async function main() {
  await run("npm", ["install"]);
  await run("npx", ["prisma", "generate"]);
  await run("npx", ["prisma", "migrate", "dev", "--name", "init"]);
  await run("npm", ["run", "db:seed"]);
  await run("npm", ["run", "dev"]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

