import type { MyTrip } from "@shareride/contracts";
import { act, fireEvent, screen } from "expo-router/testing-library";
import { AccessibilityInfo, Dimensions, Linking } from "react-native";
import {
  canCopy,
  canShareWindow,
  copyText,
  fetchPicture,
  pictureSharing,
  savePicture,
  shareLink,
  sharePicture,
} from "@/lib/share";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { driverApi, northMyTrip } from "@/testing/bookings";
import { northResult, searchApi, soonestApi, soonRide } from "@/testing/search";
import { blonduos, borgarnes, plannedDraft, tripsApi } from "@/testing/trips";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn(() => Promise.resolve(null)),
  writeAppData: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));
jest.mock("@/lib/share", () => ({
  shareLink: jest.fn(() => Promise.resolve("shared")),
  canShareWindow: jest.fn(() => true),
  canCopy: jest.fn(() => true),
  copyText: jest.fn(() => Promise.resolve("copied")),
  // The apps have no story section yet (spec 28, 3.5): each story test says.
  pictureSharing: jest.fn(() => "none"),
  fetchPicture: jest.fn(() => Promise.resolve({ name: "puffinride.png" })),
  sharePicture: jest.fn(() => Promise.resolve("shared")),
  savePicture: jest.fn(),
  pictureAddress: jest.fn(() => "blob:story"),
  forgetPictureAddress: jest.fn(),
}));

const mockedShare = shareLink as jest.Mock;
const mockedCopy = copyText as jest.Mock;
const hasShareWindow = canShareWindow as jest.Mock;
const hasClipboard = canCopy as jest.Mock;
const sharingPictures = pictureSharing as jest.Mock;
const mockedFetchPicture = fetchPicture as jest.Mock;
const mockedSharePicture = sharePicture as jest.Mock;
const mockedSave = savePicture as jest.Mock;
let openURL: jest.SpyInstance;

beforeEach(() => {
  mockedShare.mockClear();
  mockedCopy.mockClear();
  hasShareWindow.mockReturnValue(true);
  hasClipboard.mockReturnValue(true);
  sharingPictures.mockReturnValue("none");
  mockedFetchPicture.mockClear();
  mockedSharePicture.mockClear().mockImplementation(() => Promise.resolve("shared"));
  mockedSave.mockClear();
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});

afterEach(() => {
  openURL.mockRestore();
});

const resultsUrl = `/search/results?from=${borgarnes.id}&to=${blonduos.id}&fromName=Borgarnes&toName=Bl%C3%B6ndu%C3%B3s&seats=2`;

async function openResults() {
  await renderApp(resultsUrl, {
    setUp: (client) => {
      searchApi(client);
    },
  });
  await screen.findByTestId("trip-result");
}

const shareButton = (route: string) =>
  screen.findByRole("button", { name: `Share the ride ${route}` });

describe("The share icon on a ride's card (spec 28, 3.1)", () => {
  it("shares the part's link from the card's corner, without opening the trip", async () => {
    await openResults();
    await fireEvent.press(await shareButton("Borgarnes → Blönduós"));
    // The part, not the seats searched: those are for whoever opens it (spec 4, 3.7).
    expect(mockedShare).toHaveBeenCalledWith(
      `http://localhost:3000/trips/${northResult.tripId}?from=1&to=2`,
      "Borgarnes → Blönduós on PuffinRide",
    );
    expect(screen).toHavePathname("/search/results");
  });

  it("shows a tick and says so when the link was copied", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    mockedShare.mockResolvedValueOnce("copied");
    await openResults();
    await fireEvent.press(await shareButton("Borgarnes → Blönduós"));
    expect(await screen.findByTestId("share-copied")).toBeVisible();
    expect(announce).toHaveBeenCalledWith("Link copied. Paste it wherever you like.");
    announce.mockRestore();
  });

  it("shows the link to copy by hand when it could not be shared", async () => {
    mockedShare.mockResolvedValueOnce("failed");
    await openResults();
    await fireEvent.press(await shareButton("Borgarnes → Blönduós"));
    expect(
      await screen.findByText(
        `The link could not be shared. Here it is to copy: http://localhost:3000/trips/${northResult.tripId}?from=1&to=2`,
      ),
    ).toBeVisible();
  });

  it("is on the front page's rides leaving soon, for the whole route", async () => {
    const ride = soonRide("2026-11-15");
    await renderApp("/", {
      setUp: (fake) => {
        soonestApi(fake, [ride]);
      },
    });
    await fireEvent.press(await shareButton("BSÍ bus terminal → Hof, Akureyri"));
    expect(mockedShare).toHaveBeenCalledWith(
      `http://localhost:3000/trips/${ride.tripId}?from=0&to=3`,
      "BSÍ bus terminal → Hof, Akureyri on PuffinRide",
    );
    expect(screen).toHavePathname("/");
  });
});

// The north trip asks the driver about each booking; most book at once.
const northTrip: MyTrip = { ...northMyTrip, bookingMode: "instant" };
const tripId = northTrip.id;
const tripLink = `http://localhost:3000/trips/${tripId}?from=0&to=3`;
const englishPost = [
  "Offering a ride: BSÍ bus terminal → Hof, Akureyri",
  "Sunday 15 November at 09:00",
  "Stops on the way: Borgarnes, Blönduós",
  `Book a seat on PuffinRide: ${tripLink}`,
].join("\n");

/** Opens a driver's screen with the north trip, or `trips`, in the fake API. */
async function openDriver(url: string, trips: MyTrip[] = [northTrip]) {
  return renderApp(url, {
    me: completeMe,
    setUp: (client) => {
      tripsApi(client, trips);
      driverApi(client, []);
    },
  });
}

describe("Share this ride, after publishing (spec 28, 3.2)", () => {
  const published = `/drive/trips/${tripId}/published`;

  it("comes after the trip's card, with the post text in the app's language", async () => {
    await openDriver(published);
    expect(await screen.findByRole("header", { name: "Share this ride" })).toBeVisible();
    expect(
      screen.getByText("Post it where people look for rides, such as carpool groups on Facebook."),
    ).toBeVisible();
    expect(screen.getByLabelText("Text for your post")).toHaveTextContent(englishPost);
    // It replaces the old button, by the name it had.
    expect(screen.queryByRole("button", { name: "Share the trip" })).toBeNull();
    expect(screen.getByRole("link", { name: "See your ride" })).toBeVisible();
  });

  it("opens the share window with the post and the whole trip's link", async () => {
    await openDriver(published);
    await fireEvent.press(await screen.findByRole("button", { name: "Share" }));
    expect(mockedShare).toHaveBeenCalledWith(
      tripLink,
      englishPost.replace(` ${tripLink}`, ""),
      "BSÍ bus terminal → Hof, Akureyri on PuffinRide",
    );
  });

  it("has no Share where there is no share window", async () => {
    hasShareWindow.mockReturnValue(false);
    await openDriver(published);
    expect(await screen.findByRole("button", { name: "Share on Facebook" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });

  it("opens Facebook's share window for the link, and says to paste the text", async () => {
    await openDriver(published);
    await fireEvent.press(await screen.findByRole("button", { name: "Share on Facebook" }));
    expect(openURL).toHaveBeenCalledWith(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(tripLink)}`,
    );
    expect(
      screen.getByText(
        "On your wall, in a group or in Messenger. Facebook doesn't let apps write the post, so copy the text below and paste it in.",
      ),
    ).toBeVisible();
    // Facebook does not get the text, and nothing is copied without asking.
    expect(mockedCopy).not.toHaveBeenCalled();
  });

  it("writes the post in Icelandic when chosen, and copies it", async () => {
    await openDriver(published);
    await fireEvent.press(await screen.findByRole("radio", { name: "Íslenska" }));
    const icelandic = [
      "Býð far: BSÍ umferðarmiðstöð → Hof, Akureyri",
      "Sunnudagur 15. nóvember kl. 09:00",
      "Mótsstaðir á leiðinni: Borgarnes, Blönduós",
      `Bókaðu sæti á PuffinRide: ${tripLink}`,
    ].join("\n");
    expect(screen.getByLabelText("Text for your post")).toHaveTextContent(icelandic);
    expect(screen.getByRole("radio", { name: "Íslenska" })).toBeChecked();
    await fireEvent.press(screen.getByRole("button", { name: "Copy text" }));
    expect(mockedCopy).toHaveBeenCalledWith(icelandic);
    expect(await screen.findByText("Text copied. Paste it into your post.")).toBeVisible();
  });

  it("follows the app's language until the driver picks one for the post", async () => {
    // On a laptop, where the top bar has the language.
    Dimensions.set({ window: { width: 1280, height: 800, scale: 1, fontScale: 1 } });
    try {
      await openDriver(published);
      await fireEvent.press(
        await screen.findByRole("button", { name: "Change the language to Icelandic" }),
      );
      const box = () => screen.findByLabelText("Texti í færsluna");
      expect(await box()).toHaveTextContent(/^Býð far: /u);
      await fireEvent.press(screen.getByRole("radio", { name: "English" }));
      expect(await box()).toHaveTextContent(/^Offering a ride: /u);
      // Picked, it stays when the app's language changes again.
      await fireEvent.press(screen.getByRole("button", { name: "Skipta yfir í ensku" }));
      await fireEvent.press(
        await screen.findByRole("button", { name: "Change the language to Icelandic" }),
      );
      expect(await box()).toHaveTextContent(/^Offering a ride: /u);
    } finally {
      await act(() => {
        Dimensions.set({ window: { width: 750, height: 1334, scale: 2, fontScale: 2 } });
      });
    }
  });

  it("says to select the text by hand when it could not be copied", async () => {
    mockedCopy.mockResolvedValueOnce("failed");
    await openDriver(published);
    await fireEvent.press(await screen.findByRole("button", { name: "Copy text" }));
    expect(
      await screen.findByText("The text couldn't be copied. Select it in the box to copy it."),
    ).toBeVisible();
  });

  it("says to copy by hand in the apps, which have no clipboard of their own", async () => {
    hasClipboard.mockReturnValue(false);
    await openDriver(published);
    expect(await screen.findByLabelText("Text for your post")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Copy text" })).toBeNull();
    expect(
      screen.getByText(
        "On your wall, in a group or in Messenger. Facebook doesn't let apps write the post, so press and hold the text below to copy it, then paste it in.",
      ),
    ).toBeVisible();
  });

  it("reads out each copy", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await openDriver(published);
    const copy = await screen.findByRole("button", { name: "Copy text" });
    announce.mockClear();
    await fireEvent.press(copy);
    await fireEvent.press(copy);
    expect(
      announce.mock.calls.filter(([said]) => said === "Text copied. Paste it into your post."),
    ).toHaveLength(2);
    announce.mockRestore();
  });

  it("opens one share window at a time", async () => {
    let close = () => {};
    mockedShare.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          close = () => {
            resolve("shared");
          };
        }),
    );
    await openDriver(published);
    const share = await screen.findByRole("button", { name: "Share" });
    await fireEvent.press(share);
    await fireEvent.press(share);
    expect(mockedShare).toHaveBeenCalledTimes(1);
    await act(() => {
      close();
    });
    await fireEvent.press(share);
    expect(mockedShare).toHaveBeenCalledTimes(2);
  });

  it("shows the link to paste when Facebook does not open, and the Page's when it does not", async () => {
    openURL.mockRejectedValue(new Error("No app"));
    await openDriver(published);
    await fireEvent.press(await screen.findByRole("button", { name: "Share on Facebook" }));
    expect(
      await screen.findByText(`The link could not be shared. Here it is to copy: ${tripLink}`),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("link", { name: "Follow PuffinRide on Facebook" }));
    expect(
      await screen.findByText(
        "The link could not be shared. Here it is to copy: https://www.facebook.com/profile.php?id=61597055066444",
      ),
    ).toBeVisible();
  });

  it("is not there once the trip has left", async () => {
    await openDriver(published, [{ ...northTrip, status: "departed" }]);
    expect(await screen.findByRole("header", { name: "Your ride is published" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Share this ride" })).toBeNull();
  });

  it("links to PuffinRide's Facebook Page", async () => {
    await openDriver(published);
    await fireEvent.press(
      await screen.findByRole("link", { name: "Follow PuffinRide on Facebook" }),
    );
    expect(openURL).toHaveBeenCalledWith("https://www.facebook.com/profile.php?id=61597055066444");
  });

  it("asks for a seat for a trip where the driver approves each booking", async () => {
    await openDriver(published, [northMyTrip]);
    expect(await screen.findByLabelText("Text for your post")).toHaveTextContent(
      `Ask for a seat on PuffinRide: ${tripLink}`,
      { exact: false },
    );
  });
});

describe("Share this ride, a screen of its own (spec 28, 3.1 and 3.2)", () => {
  it("opens from a published trip's corner in My trips", async () => {
    await openDriver("/drive/trips");
    await fireEvent.press(
      await screen.findByRole("button", {
        name: "Share the ride BSÍ bus terminal → Hof, Akureyri",
      }),
    );
    expect(screen).toHavePathname(`/drive/trips/${tripId}/share`);
    expect(await screen.findByRole("header", { name: "Share this ride" })).toBeVisible();
    expect(screen.getByLabelText("Text for your post")).toHaveTextContent(englishPost);
  });

  it("has no corner on a draft or on a trip under way", async () => {
    const draft = plannedDraft({ id: "0190a1d6-0000-7000-8000-000000000202" });
    const underWay = {
      ...northTrip,
      id: "0190a1d6-0000-7000-8000-000000000204",
      status: "departed" as const,
    };
    await openDriver("/drive/trips", [draft, underWay]);
    expect(await screen.findByRole("header", { name: "Published" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Share the ride/ })).toBeNull();
  });

  it("opens from the head of the driver's trip page", async () => {
    await openDriver(`/drive/trips/${tripId}`);
    await fireEvent.press(await screen.findByRole("button", { name: "Share this ride" }));
    expect(screen).toHavePathname(`/drive/trips/${tripId}/share`);
    expect(await screen.findByRole("header", { name: "Share this ride" })).toBeVisible();
  });

  it("is not on the trip page once the trip has left", async () => {
    await openDriver(`/drive/trips/${tripId}`, [{ ...northTrip, status: "departed" }]);
    expect(await screen.findByText("BSÍ bus terminal → Hof, Akureyri")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Share this ride" })).toBeNull();
  });

  it("says when the trip cannot be found, with a way to My trips", async () => {
    await openDriver(`/drive/trips/0190a1d6-0000-7000-8000-0000000009ff/share`);
    expect(
      await screen.findByText(
        "This ride can't be found. The link may be wrong, or the ride removed.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await fireEvent.press(screen.getByRole("link", { name: "See my rides" }));
    expect(screen).toHavePathname("/drive/trips");
  });

  it("refuses a trip that has left, with a way back to it", async () => {
    await openDriver(`/drive/trips/${tripId}/share`, [{ ...northTrip, status: "departed" }]);
    expect(
      await screen.findByText("Only a published ride that hasn't left can be shared."),
    ).toBeVisible();
    expect(screen.queryByLabelText("Text for your post")).toBeNull();
    await fireEvent.press(screen.getByRole("link", { name: "See the ride" }));
    expect(screen).toHavePathname(`/drive/trips/${tripId}`);
  });
});

describe("Story on Instagram, on the web (spec 28, 3.2 item 5 and 3.5)", () => {
  const published = `/drive/trips/${tripId}/published`;
  const story = `http://localhost:3000/v1/trips/${tripId}/story.png?fromStop=0&toStop=3&lang=en&download=1`;
  const storyFile = { name: "puffinride.png" };

  it("shares or saves the picture, fetched once as the panel shows, from a phone's browser", async () => {
    sharingPictures.mockReturnValue("share");
    await openDriver(published);
    expect(await screen.findByRole("header", { name: "Story on Instagram" })).toBeVisible();
    expect(
      screen.getByText(
        "A picture of your ride for your story. Instagram doesn't take links in posts, so add the link with a link sticker.",
      ),
    ).toBeVisible();
    expect(mockedFetchPicture).toHaveBeenCalledTimes(1);
    expect(mockedFetchPicture).toHaveBeenCalledWith(story, "puffinride.png", expect.anything());
    await fireEvent.press(await screen.findByRole("button", { name: "Share picture" }));
    expect(mockedSharePicture).toHaveBeenCalledWith(storyFile);
    // A laptop's browser may share a file too, so the picture can always be saved.
    await fireEvent.press(screen.getByRole("button", { name: "Download picture" }));
    expect(mockedSave).toHaveBeenCalledWith(storyFile);
  });

  it("draws the picture in the post's language", async () => {
    sharingPictures.mockReturnValue("share");
    await openDriver(published);
    await fireEvent.press(await screen.findByRole("radio", { name: "Íslenska" }));
    expect(mockedFetchPicture).toHaveBeenLastCalledWith(
      story.replace("lang=en", "lang=is"),
      "puffinride.png",
      expect.anything(),
    );
  });

  it("saves the picture where the browser cannot share it", async () => {
    sharingPictures.mockReturnValue("download");
    await openDriver(published);
    await fireEvent.press(await screen.findByRole("button", { name: "Download picture" }));
    expect(mockedSave).toHaveBeenCalledWith(storyFile);
    expect(screen.queryByRole("button", { name: "Share picture" })).toBeNull();
  });

  it("says when the picture could not be made, and tries again", async () => {
    sharingPictures.mockReturnValue("share");
    mockedFetchPicture.mockResolvedValueOnce(null);
    await openDriver(published);
    expect(await screen.findByText("The picture couldn't be made just now.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Share picture" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download picture" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Share picture" })).toBeVisible();
    expect(mockedFetchPicture).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("The picture couldn't be made just now.")).toBeNull();
  });

  it("says when the picture could not be shared, and keeps Download picture", async () => {
    sharingPictures.mockReturnValue("share");
    mockedSharePicture.mockImplementation(() => Promise.resolve("failed"));
    await openDriver(published);
    await fireEvent.press(await screen.findByRole("button", { name: "Share picture" }));
    expect(
      await screen.findByText("The picture couldn't be shared here. Download it instead."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Download picture" })).toBeVisible();
  });

  it("opens one share window at a time, and keeps Share picture after it", async () => {
    sharingPictures.mockReturnValue("share");
    let close = () => {};
    mockedSharePicture.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          close = () => {
            resolve("shared");
          };
        }),
    );
    // A second share while the window is open would be refused by the browser.
    mockedSharePicture.mockImplementation(() => Promise.resolve("failed"));
    await openDriver(published);
    const share = await screen.findByRole("button", { name: "Share picture" });
    await fireEvent.press(share);
    await fireEvent.press(share);
    expect(mockedSharePicture).toHaveBeenCalledTimes(1);
    await act(() => {
      close();
    });
    expect(screen.getByRole("button", { name: "Share picture" })).toBeVisible();
    expect(
      screen.queryByText("The picture couldn't be shared here. Download it instead."),
    ).toBeNull();
  });

  it("copies the link for the sticker", async () => {
    sharingPictures.mockReturnValue("download");
    await openDriver(published);
    await fireEvent.press(await screen.findByRole("button", { name: "Copy link" }));
    expect(mockedCopy).toHaveBeenCalledWith(tripLink);
    expect(await screen.findByText("Link copied. Paste it wherever you like.")).toBeVisible();
  });

  it("reads out each link copied", async () => {
    sharingPictures.mockReturnValue("download");
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await openDriver(published);
    const copy = await screen.findByRole("button", { name: "Copy link" });
    announce.mockClear();
    await fireEvent.press(copy);
    await fireEvent.press(copy);
    expect(
      announce.mock.calls.filter(([said]) => said === "Link copied. Paste it wherever you like."),
    ).toHaveLength(2);
    announce.mockRestore();
  });

  it("is not in the apps yet", async () => {
    await openDriver(published);
    expect(await screen.findByRole("header", { name: "Share this ride" })).toBeVisible();
    expect(screen.queryByRole("header", { name: "Story on Instagram" })).toBeNull();
    expect(mockedFetchPicture).not.toHaveBeenCalled();
  });
});
