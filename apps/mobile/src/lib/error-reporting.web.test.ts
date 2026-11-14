// The web's error reporting loads Sentry after the app starts; these tests
// check what happens to an error caught before, during and after that.
import { lazyErrorReporting } from "./error-reporting.web";

const options = { dsn: "https://public@o1.ingest.de.sentry.io/2", environment: "staging" };

function fakeSdk() {
  return { init: jest.fn(), captureException: jest.fn(() => "event-id") };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Error reporting on the web", () => {
  it("sends an error caught before Sentry has loaded once it has", async () => {
    const sdk = fakeSdk();
    const reporting = lazyErrorReporting(options, () => Promise.resolve(sdk));
    const early = new Error("early");
    const late = new Error("late");

    reporting.startErrorReporting();
    reporting.reportError(early);
    expect(sdk.captureException).not.toHaveBeenCalled();
    await settle();
    reporting.reportError(late);

    expect(sdk.init).toHaveBeenCalledWith(options);
    expect(sdk.captureException.mock.calls).toEqual([[early], [late]]);
  });

  it("loads nothing and keeps nothing when the build does not report", async () => {
    const load = jest.fn(() => Promise.resolve(fakeSdk()));
    const reporting = lazyErrorReporting(undefined, load);

    reporting.startErrorReporting();
    reporting.reportError(new Error("not sent"));
    await settle();

    expect(load).not.toHaveBeenCalled();
  });

  it("carries on without reports when Sentry cannot load", async () => {
    const reporting = lazyErrorReporting(options, () => Promise.reject(new Error("offline")));

    reporting.startErrorReporting();
    reporting.reportError(new Error("waiting"));
    await settle();

    expect(() => {
      reporting.reportError(new Error("after"));
    }).not.toThrow();
  });
});
