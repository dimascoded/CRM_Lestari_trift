import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.ts";

const db = new PrismaClient();
const roles = ["CASHIER", "STOCK_STAFF", "MANAGER", "MARKETING", "OWNER"];
const input = createInterface({ input: stdin, output: stdout });

function askHidden(label) {
  stdout.write(label);
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    let settled = false;
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.off("end", onEnd);
      stdin.off("error", onError);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      stdout.write("\n");
      reject(error);
    };
    const onData = (chunk) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003") {
          fail(new Error("User provisioning cancelled."));
          return;
        }
        if (character === "\u0004") {
          fail(new Error("Password input cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          settled = true;
          cleanup();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
        } else if (character >= " ") {
          value += character;
        }
      }
    };
    const onEnd = () => fail(new Error("Password input ended."));
    const onError = (error) => fail(error);
    stdin.on("data", onData);
    stdin.once("end", onEnd);
    stdin.once("error", onError);
  });
}

async function main() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command from an interactive terminal so the password can be hidden.");
  }

  const name = (await input.question("Nama staf: ")).trim();
  const email = (await input.question("Email login: ")).trim().toLowerCase();
  const role = (await input.question(`Peran (${roles.join(", ")}): `)).trim().toUpperCase();
  if (
    !name ||
    name.length > 100 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !roles.includes(role)
  ) {
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

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new Error("Email sudah digunakan.");

  input.close();
  const password = await askHidden("Password (min. 12 karakter): ");
  const confirmation = await askHidden("Ulangi password: ");
  if (password !== confirmation) throw new Error("Password tidak sama.");
  if (password.length < 12 || password.length > 200) {
    throw new Error("Password harus berisi 12 sampai 200 karakter.");
  }
  const passwordHash = await hashPassword(password);
  const unusedOwner = role === "OWNER"
    ? await db.user.findFirst({ where: { role: "OWNER", email: null, active: true } })
    : null;

  try {
    if (unusedOwner) {
      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: unusedOwner.id },
          data: { name, email, passwordHash, role: "OWNER", branchId: null, active: true },
        });
        await tx.userSession.deleteMany({ where: { userId: unusedOwner.id } });
      });
    } else {
      await db.user.create({ data: { name, email, passwordHash, role, branchId } });
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      throw new Error("Email sudah digunakan.");
    }
    throw error;
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
