/**
 * Fluvo Admin — Password Hash Generator
 * Run: node scripts/generate-hash.js "YourStrongPassword"
 *
 * Copy the output hash and set it as ADMIN_PASSWORD_HASH in your environment variables.
 */
import bcrypt from 'bcryptjs';

const password = process.argv[2];

if (!password) {
  console.error('\nUsage: node scripts/generate-hash.js "YourPassword"\n');
  process.exit(1);
}

if (password.length < 8) {
  console.error('\nError: Password must be at least 8 characters long.\n');
  process.exit(1);
}

const SALT_ROUNDS = 12;
console.log('\nGenerating bcrypt hash (this may take a moment)...\n');

const hash = await bcrypt.hash(password, SALT_ROUNDS);

console.log('============================================================');
console.log('ADMIN_PASSWORD_HASH=' + hash);
console.log('============================================================');
console.log('\nCopy the above value and set it as ADMIN_PASSWORD_HASH');
console.log('in your Vercel environment variables (admin project).\n');
console.log('NEVER commit this hash or your plaintext password to Git.\n');
