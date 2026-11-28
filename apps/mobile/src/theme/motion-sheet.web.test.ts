import { lastOfArrival, playingParts } from "./motion-css";
import { whenArrived } from "./motion-sheet.web";

// Tests run without a browser: a page with only what `whenArrived` uses.

/** A part of the page that matches only its own selector, in the car or a moment's scene or not. */
class Part {
  constructor(
    private readonly selector: string,
    private readonly playing = true,
  ) {}
  matches(selector: string) {
    return selector === this.selector;
  }
  closest(selector: string) {
    return this.playing && selector === playingParts ? this : null;
  }
}

/** An animation the page lists, of `part`, still running until it is finished. */
function running(part: Part) {
  return { playState: "running", effect: { target: part } };
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

  it("waits past the driver's hop while the day's moment still plays, until its last part ends (spec 36, 3.6)", () => {
    const flake = new Part('[data-motion="flake"]');
    const other = new Part(".spinner", false);
    const snow = running(flake);
    const listed = [running(new Part(lastOfArrival)), snow, running(other)];
    Object.assign(page, { getAnimations: () => listed.filter((a) => a.playState !== "finished") });
    const done = jest.fn();
    whenArrived(done);
    listed[0] = { ...listed[0], playState: "finished" } as (typeof listed)[number];
    page.dispatchEvent(animation("animationend", new Part(lastOfArrival)));
    expect(done).not.toHaveBeenCalled();
    // The last flake lands; what moves elsewhere on the page is not the moment's.
    snow.playState = "finished";
    page.dispatchEvent(animation("animationend", flake));
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
