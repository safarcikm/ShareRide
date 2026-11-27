// A new email address and Icelandic mobile number for this run, as the web
// journeys make them (e2e/support/account.ts and sms.ts). The test database
// is new each run.
// The name Maestro gives its scripts to pass values on to the flow.
/* global output */
const stamp = String(Date.now()).slice(-7);
output.email = `phone-${stamp}@example.com`;
output.phoneLocal = `69${stamp.slice(-5)}`;
output.phoneE164 = `+354${output.phoneLocal}`;
