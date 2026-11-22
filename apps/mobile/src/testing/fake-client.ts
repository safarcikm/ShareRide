// A stand-in for the API in component and session tests: each route path
// answers with what the test says. Not used by the app itself.
import type { ApiClient, CallResult } from "@shareride/api-client";
import type { Me, RouteDefinition } from "@shareride/contracts";

export type FakeAnswer = (input: Record<string, unknown>) => unknown;

export interface FakeClient extends ApiClient {
  /** Calls made, oldest first: route path and input. */
  readonly calls: { path: string; input: Record<string, unknown> }[];
  /** With a method, only that method's calls; such an answer comes first. */
  answer(path: string, answer: FakeAnswer, method?: string): void;
}

export const testMe: Me = {
  id: "0190a1d6-0000-7000-8000-000000000001",
  profileId: "6c1b7e0a-41d2-4f0e-9a51-000000000001",
  phoneNumber: "+3546900000",
  firstName: null,
  about: null,
  languages: [],
  photo: null,
  locale: "en",
  email: null,
  pendingEmail: null,
  pushOn: false,
  ageConfirmed: false,
  memberSince: "2026-11-13T12:00:00.000Z",
  missingSteps: ["legal", "profile"],
  suspension: null,
  deletionScheduledFor: null,
};

export const ok = (status: number, data?: unknown) => ({ ok: true, status, data });
export const failure = (status: number, code: string, extras: Record<string, unknown> = {}) => ({
  ok: false,
  status,
  error: { code, message: code, ...extras },
});

export const tokens = (n: number) => ({
  accessToken: `sr_at_access-${String(n)}`,
  accessTokenExpiresAt: "2026-11-13T12:15:00.000Z",
  refreshToken: `sr_rt_refresh-${String(n)}`,
  refreshTokenExpiresAt: "2027-01-12T12:00:00.000Z",
});

export function createFakeClient(): FakeClient {
  const answers = new Map<string, FakeAnswer>();
  const calls: FakeClient["calls"] = [];
  return {
    calls,
    answer(path, answer, method) {
      answers.set(method === undefined ? path : `${method} ${path}`, answer);
    },
    call<R extends RouteDefinition>(route: R, input: object) {
      const values = input as Record<string, unknown>;
      calls.push({ path: route.path, input: values });
      const answer = answers.get(`${route.method} ${route.path}`) ?? answers.get(route.path);
      if (answer === undefined) throw new Error(`No fake answer for ${route.path}`);
      return Promise.resolve(answer(values) as CallResult<R>);
    },
  };
}
