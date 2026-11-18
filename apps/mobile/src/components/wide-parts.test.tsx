import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions, Text } from "react-native";
import { Columns } from "./columns";
import { Grid } from "./grid";
import { Screen } from "./screen";

// The parts that lay a screen out on wide screens (spec 18, 3.2): a page
// 1144 wide, a main column with a side column, and a grid of cards.

const phone = { width: 750, height: 1334, scale: 2, fontScale: 2 };
const laptop = { width: 1280, height: 800, scale: 1, fontScale: 1 };

function setWindow(window: typeof phone) {
  Dimensions.set({ window });
}

afterEach(() => {
  setWindow(phone);
});

/** The order of two parts in what is rendered: negative when `first` comes first. */
function order(first: string, second: string) {
  const all = JSON.stringify(screen.toJSON());
  return all.indexOf(first) - all.indexOf(second);
}

describe("Screen", () => {
  const page = (
    <Screen width="page">
      <Text>Inside</Text>
    </Screen>
  );

  it("is a page 1144 wide on wide screens when asked", async () => {
    setWindow(laptop);
    await render(page);
    expect(screen.getByTestId("page")).toHaveStyle({ maxWidth: 1144, width: "100%" });
  });

  it("stays one column on a phone", async () => {
    await render(page);
    expect(screen.queryByTestId("page")).toBeNull();
    expect(screen.getByText("Inside")).toBeVisible();
  });

  it("keeps the column when not asked for a page", async () => {
    setWindow(laptop);
    await render(
      <Screen>
        <Text>Inside</Text>
      </Screen>,
    );
    expect(screen.queryByTestId("page")).toBeNull();
  });
});

describe("Columns", () => {
  const columns = (sideAt?: "start" | "end") => (
    <Columns side={<Text>Side part</Text>} {...(sideAt === undefined ? {} : { sideAt })}>
      <Text>Main part</Text>
    </Columns>
  );

  it("puts the side column, 400 wide, at the right of the main column", async () => {
    setWindow(laptop);
    await render(columns());
    expect(screen.getByTestId("columns")).toHaveStyle({ flexDirection: "row" });
    expect(screen.getByTestId("columns-side")).toHaveStyle({ width: 400 });
    expect(screen.getByTestId("columns-main")).toHaveStyle({ flex: 1, minWidth: 0 });
    expect(order("Main part", "Side part")).toBeLessThan(0);
  });

  it("can put the side column at the left, still read after the main column", async () => {
    setWindow(laptop);
    await render(columns("start"));
    expect(screen.getByTestId("columns")).toHaveStyle({ flexDirection: "row-reverse" });
    expect(order("Main part", "Side part")).toBeLessThan(0);
  });

  it("takes another width for the side column", async () => {
    setWindow(laptop);
    await render(
      <Columns side={<Text>Side part</Text>} sideWidth={360}>
        <Text>Main part</Text>
      </Columns>,
    );
    expect(screen.getByTestId("columns-side")).toHaveStyle({ width: 360 });
  });

  it("stacks the two on a phone, main first", async () => {
    await render(columns());
    expect(screen.getByTestId("columns")).toHaveStyle({ flexDirection: "column" });
    expect(screen.getByTestId("columns-side")).not.toHaveStyle({ width: 400 });
    expect(screen.getByText("Main part")).toBeVisible();
    expect(screen.getByText("Side part")).toBeVisible();
    expect(order("Main part", "Side part")).toBeLessThan(0);
  });

  it("follows the window as it turns wide", async () => {
    await render(columns());
    await act(() => {
      setWindow(laptop);
    });
    expect(screen.getByTestId("columns")).toHaveStyle({ flexDirection: "row" });
  });
});

describe("Grid", () => {
  const grid = (
    <Grid>
      <Text>One</Text>
      <Text>Two</Text>
      <Text>Three</Text>
    </Grid>
  );

  async function layOut(width: number) {
    await fireEvent(screen.getByTestId("grid"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width, height: 100 } },
    });
  }

  it("is one column until it knows its width", async () => {
    await render(grid);
    for (const cell of screen.getAllByTestId("grid-cell")) {
      expect(cell).toHaveStyle({ width: "100%" });
    }
  });

  it("fits as many columns as are at least 320 wide", async () => {
    await render(grid);
    // Two columns of 344 and a gap of 16.
    await layOut(704);
    expect(screen.getAllByTestId("grid-cell")).toHaveLength(3);
    for (const cell of screen.getAllByTestId("grid-cell")) {
      expect(cell).toHaveStyle({ width: 344 });
    }
    // Three columns of 320 need 992.
    await layOut(992);
    for (const cell of screen.getAllByTestId("grid-cell")) {
      expect(cell).toHaveStyle({ width: 320 });
    }
  });

  it("is one column when two do not fit", async () => {
    await render(grid);
    await layOut(500);
    for (const cell of screen.getAllByTestId("grid-cell")) {
      expect(cell).toHaveStyle({ width: 500 });
    }
  });

  it("keeps its columns when text is twice the size", async () => {
    expect(Dimensions.get("window").fontScale).toBe(2);
    await render(grid);
    await layOut(704);
    for (const cell of screen.getAllByTestId("grid-cell")) {
      expect(cell).toHaveStyle({ width: 344 });
    }
  });

  it("leaves out children that show nothing", async () => {
    await render(
      <Grid>
        <Text>One</Text>
        {null}
        {false}
      </Grid>,
    );
    expect(screen.getAllByTestId("grid-cell")).toHaveLength(1);
  });
});
