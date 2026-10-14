import bcrypt from "bcryptjs";

const password = process.argv[2];
if ((password ?? "").length < 8) {
  console.error("Usage: node scripts/hash-password.mjs '<mot de passe d’au moins 8 caractères>'");
  process.exit(1);
}
console.log(await bcrypt.hash(password, 12));
