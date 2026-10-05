/**
 * Grant or revoke the `admin` custom claim for a Firebase user.
 *
 * Usage:
 *   node scripts/setAdminClaim.js <email>            # grant
 *   node scripts/setAdminClaim.js <email> --revoke   # revoke
 *
 * Uses FIREBASE_* credentials from .env. The user must refresh their ID token
 * (sign out and back in) before the change takes effect.
 */
require('dotenv').config();

const { getFirebaseAuth } = require('../src/config/firebase');

async function main() {
  const [email, flag] = process.argv.slice(2);

  if (!email) {
    console.error('Usage: node scripts/setAdminClaim.js <email> [--revoke]');
    process.exit(1);
  }

  const auth = getFirebaseAuth();
  if (!auth) {
    console.error('Firebase Admin SDK is not configured (check FIREBASE_* env vars)');
    process.exit(1);
  }

  const user = await auth.getUserByEmail(email);
  const isAdmin = flag !== '--revoke';

  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: isAdmin });

  if (!isAdmin) {
    // Invalidate existing sessions so revoked access applies immediately
    await auth.revokeRefreshTokens(user.uid);
  }

  console.log(`${isAdmin ? 'Granted' : 'Revoked'} admin for ${email} (${user.uid})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
