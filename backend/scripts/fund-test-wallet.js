/**
 * LOCAL TESTING ONLY.
 *
 * Sends your LOCAL backend the same "money arrived" callback Paga sends when someone
 * transfers to an account number, signed with your PAGA_HASH_KEY, so the real inbound
 * path runs (hash check, duplicate protection, ledger credit, notification, balance cap).
 * It credits TEST money in your local database; no real money moves anywhere.
 *
 * It refuses to run against anything but localhost or when NODE_ENV=production, and it
 * changes nothing in the app: it is only a client for the public webhook endpoint.
 *
 * Usage (from the backend folder):
 *   npm run fund:test -- <accountNumber> [amountNaira]
 *   npm run fund:test -- 2996370866 50000
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createHash } = require('crypto');

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run with NODE_ENV=production.');
  process.exit(1);
}

const [accountNumber, amountNaira = '50000'] = process.argv.slice(2);
if (!/^\d{10}$/.test(accountNumber || '')) {
  console.error('Give the 10-digit account number to credit, e.g. npm run fund:test -- 2996370866 50000');
  process.exit(1);
}
if (!(Number(amountNaira) > 0)) {
  console.error('Amount must be a positive number of naira.');
  process.exit(1);
}
const base = process.env.LOCAL_API || `http://localhost:${process.env.PORT || 3050}`;
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error('Refusing to run against anything but localhost.');
  process.exit(1);
}

const body = {
  statusCode: '0',
  accountNumber,
  amount: Number(amountNaira).toFixed(2),
  clearingFeeAmount: '0',
  transferFeeAmount: '0',
  transactionReference: `local-test-fund-${Date.now()}`,
};
const key = (process.env.PAGA_HASH_KEY || '').trim();
if (!key) {
  console.error('PAGA_HASH_KEY is not set in backend/.env.');
  process.exit(1);
}
body.hash = createHash('sha512')
  .update([body.statusCode, body.accountNumber, body.amount, body.clearingFeeAmount, body.transferFeeAmount].join('') + key)
  .digest('hex');

fetch(`${base}/api/v1/webhooks/paga`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
  .then(async (r) => console.log(`webhook -> HTTP ${r.status}`, await r.text()))
  .catch((e) => console.error('Could not reach the backend:', e.message));
