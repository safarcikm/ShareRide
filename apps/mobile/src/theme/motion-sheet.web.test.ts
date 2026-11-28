import { lastOfArrival } from "./motion-css";
import { whenArrived } from "./motion-sheet.web";

// Tests run without a browser: a page with only what `whenArrived` uses.

/** A part of the page that matches only its own selector. */
class Part {
  constructor(private readonly selector: string) {}
  matches(selector: string) {
    return selector === this.selector;
  }
}

/** An animation event from `part`, as the browser sends it to the page. */
function animation(type: string, part: Part) {
  const event = new Event(type);
  Object.defineProperty(event, "target", { value: part });
  return event;
}

const globals = globalThis as unknown as Record<string, unknown>;
let page: EventTarget;
let reduceMotion = false;

beforeEach(() => {
  page = new EventTarget();
  reduceMotion = false;
  globals["document"] = page;
  globals["Element"] = Part;
  globals["window"] = {
    matchMedia: (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" && reduceMotion,
    }),
  };
});

afterEach(() => {
  delete globals["document"];
  delete globals["Element"];
  delete globals["window"];
});

describe("whenArrived (spec 33, 3.2)", () => {
  it("ends the arrival when the driver's hop, which moves last, ends", () => {
    const done = jest.fn();
    whenArrived(done);
    page.dispatchEvent(animation("animationend", new Part('[data-motion="car-body"]')));
    page.dispatchEvent(animation("animationend", new Part('[data-motion="puffin-you"]')));
    expect(done).not.toHaveBeenCalled();
    page.dispatchEvent(animation("animationend", new Part(lastOfArrival)));
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("ends it when the hop stops before its end, as when Find is left", () => {
    const done = jest.fn();
    whenArrived(done);
    page.dispatchEvent(animation("animationcancel", new Part(lastOfArrival)));
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("ends it at once with reduce motion on, when nothing moves", () => {
    reduceMotion = true;
    const done = jest.fn();
    whenArrived(done);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("stops listening when asked", () => {
    const done = jest.fn();
    const stop = whenArrived(done);
    stop();
    page.dispatchEvent(animation("animationend", new Part(lastOfArrival)));
    expect(done).not.toHaveBeenCalled();
  });
});
