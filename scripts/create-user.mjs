import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.ts";

const db = new PrismaClient();
const roles = ["CASHIER", "STOCK_STAFF", "MANAGER", "MARKETING", "OWNER"];
const input = createInterface({ input: stdin, output: stdout });

function askHidden(label) {
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003") {
          stdin.setRawMode(false);
          stdin.off("data", onData);
          reject(new Error("User provisioning cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          stdin.setRawMode(false);
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command from an interactive terminal so the password can be hidden.");
  }

  const name = (await input.question("Nama staf: ")).trim();
  const email = (await input.question("Email login: ")).trim().toLowerCase();
  const role = (await input.question(`Peran (${roles.join(", ")}): `)).trim().toUpperCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !roles.includes(role)) {
    throw new Error("Nama, email, atau peran tidak valid.");
  }

  let branchId = null;
  if (role !== "OWNER") {
    const branches = await db.branch.findMany({ orderBy: { name: "asc" } });
    console.log("Cabang:", branches.map(({ name: branchName }) => branchName).join(", "));
    const branchName = (await input.question("Cabang staf: ")).trim();
    const branch = branches.find(({ name: candidate }) => candidate.toLocaleLowerCase() === branchName.toLocaleLowerCase());
    if (!branch) throw new Error("Cabang tidak ditemukan.");
    branchId = branch.id;
  }

  input.close();
  const password = await askHidden("Password (min. 12 karakter): ");
  const confirmation = await askHidden("Ulangi password: ");
  if (password !== confirmation) throw new Error("Password tidak sama.");
  const passwordHash = await hashPassword(password);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new Error("Email sudah digunakan.");
  const unusedOwner = role === "OWNER"
    ? await db.user.findFirst({ where: { role: "OWNER", email: null } })
    : null;

  if (unusedOwner) {
    await db.user.update({
      where: { id: unusedOwner.id },
      data: { name, email, passwordHash },
    });
  } else {
    await db.user.create({ data: { name, email, passwordHash, role, branchId } });
  }
  console.log(`Akun ${role} untuk ${email} berhasil dibuat.`);
}

main()
  .catch((error) => {
    console.error("User provisioning failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    input.close();
    await db.$disconnect();
  });
