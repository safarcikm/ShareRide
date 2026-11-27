// The newest code the test API texted or emailed to TO, into output.code
// (GET /e2e/latest-code, apps/api/src/e2e-server.ts). Throws while none has
// been sent, so the flow's `retry` asks again.
// Names Maestro gives its scripts, and the flow's and the run's env.
/* global output, http, json, API_URL, TO */
const response = http.get(`${API_URL}/e2e/latest-code?to=${encodeURIComponent(TO)}`);
if (response.status !== 200) throw new Error(`No code for ${TO} yet.`);
output.code = json(response.body).code;
