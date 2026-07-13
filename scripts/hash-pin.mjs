import bcrypt from "bcryptjs";

const pin = process.argv[2];
if (!/^\d{4,8}$/.test(pin ?? "")) {
  console.error("Usage: node scripts/hash-pin.mjs <code PIN de 4 à 8 chiffres>");
  process.exit(1);
}
console.log(await bcrypt.hash(pin, 12));
