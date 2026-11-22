import { fireEvent, screen, waitFor } from "expo-router/testing-library";
import type { Me } from "@shareride/contracts";
import { checkProfilePhoto } from "@shareride/domain";
import { bytesFromBase64 } from "@/lib/base64";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { photoSizeIs, resetManipulator } from "@/testing/image-manipulator";
import { cameraAllowedIs, launchCameraAsync, photoPickedIs } from "@/testing/image-picker";
import { meetingPoints } from "@/testing/meeting-points";
import { annaProfile, annaProfileId, newcomer, profileApi } from "@/testing/people";
import { northResult, northTrip, tripDetailsApi } from "@/testing/search";
import { readyDriver, yaris } from "@/testing/trips";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

// A profile photo (spec 1, 3.5; ADR 0033): the app crops it square, makes
// it at most 640 pixels, writes it as a JPEG and drops what the phone added.

const link = "https://photos.test/profile-photos/0193f0c4-7d4a-7b1e-9c2a-123456789abc.jpg";
const withPhoto: Me = { ...completeMe, photo: { url: link, hidden: false } };

function picks(width: number, height: number) {
  const uri = `file:///picked-${String(width)}x${String(height)}.jpg`;
  photoPickedIs({ uri, width, height });
  photoSizeIs(uri, { width, height });
}

function drivingApi(client: FakeClient) {
  client.answer("/v1/me/driver-readiness", () => ok(200, readyDriver));
  client.answer("/v1/me/vehicles", () => ok(200, { vehicles: [yaris] }));
  client.answer("/v1/meeting-points", () => ok(200, { meetingPoints }));
}

async function openProfile(me: Me = completeMe) {
  const app = await renderApp("/profile", { me, setUp: drivingApi });
  expect(await screen.findByRole("header", { name: "My profile" })).toBeVisible();
  return app;
}

/** Avatars are hidden from screen readers, as the name is beside them. */
const hidden = { includeHiddenElements: true } as const;

const photoCalls = (client: FakeClient) =>
  client.calls.filter((call) => call.path === "/v1/me/photo");

beforeEach(() => {
  resetManipulator();
  photoPickedIs(null);
  cameraAllowedIs(true);
  launchCameraAsync.mockClear();
});

describe("my profile photo (spec 1, 3.5)", () => {
  it("adds a photo from my photos, cleaned, and shows it in place of my letter", async () => {
    const app = await openProfile();
    expect(screen.queryByTestId("avatar-photo", hidden)).toBeNull();
    picks(1200, 900);
    app.client.answer("/v1/me/photo", () => ok(200, withPhoto), "put");

    await fireEvent.press(screen.getByRole("button", { name: "Add a photo" }));
    expect(await screen.findByText("Photo saved.")).toBeVisible();
    expect(screen.getByTestId("avatar-photo", hidden)).toHaveProp("source", { uri: link });
    const [sent] = photoCalls(app.client);
    const photo = bytesFromBase64((sent?.input["body"] as { photo: string }).photo);
    if (photo === undefined) throw new Error("Not base64.");
    // Square, 640 pixels, and without the place the phone wrote into it.
    expect(checkProfilePhoto(photo)).toEqual({ ok: true, value: { edge: 640 } });
    expect(screen.getByRole("button", { name: "Change photo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeVisible();
  });

  it("takes a photo with the phone's camera", async () => {
    const app = await openProfile();
    picks(640, 640);
    app.client.answer("/v1/me/photo", () => ok(200, withPhoto), "put");
    await fireEvent.press(screen.getByRole("button", { name: "Take a photo" }));
    expect(await screen.findByText("Photo saved.")).toBeVisible();
    expect(launchCameraAsync).toHaveBeenCalled();
  });

  it("says how to let the app use the camera when it may not", async () => {
    const app = await openProfile();
    cameraAllowedIs(false);
    await fireEvent.press(screen.getByRole("button", { name: "Take a photo" }));
    expect(
      await screen.findByText(
        "To take a photo, let ShareRide use the camera in your phone's settings.",
      ),
    ).toBeVisible();
    expect(photoCalls(app.client)).toEqual([]);
  });

  it("sends nothing when I cancel", async () => {
    const app = await openProfile();
    await fireEvent.press(screen.getByRole("button", { name: "Add a photo" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add a photo" })).toBeEnabled();
    });
    expect(photoCalls(app.client)).toEqual([]);
    expect(screen.queryByTestId("notice")).toBeNull();
  });

  it("says a photo is too small, and sends nothing", async () => {
    const app = await openProfile();
    picks(200, 300);
    await fireEvent.press(screen.getByRole("button", { name: "Add a photo" }));
    expect(
      await screen.findByText("This photo is too small. Choose one at least 256 pixels across."),
    ).toBeVisible();
    expect(photoCalls(app.client)).toEqual([]);
  });

  it("keeps my photo and says so when it could not be saved", async () => {
    const app = await openProfile(withPhoto);
    picks(640, 640);
    app.client.answer("/v1/me/photo", () => failure(503, "photo_storage_unavailable"), "put");
    await fireEvent.press(screen.getByRole("button", { name: "Change photo" }));
    expect(
      await screen.findByText("Your photo couldn't be saved. Try again in a moment."),
    ).toBeVisible();
    expect(screen.getByTestId("avatar-photo", hidden)).toHaveProp("source", { uri: link });
  });

  it("says when this server takes no photos yet", async () => {
    const app = await openProfile();
    picks(640, 640);
    app.client.answer("/v1/me/photo", () => failure(503, "photo_storage_off"), "put");
    await fireEvent.press(screen.getByRole("button", { name: "Add a photo" }));
    expect(await screen.findByText("Photos can't be added yet.")).toBeVisible();
  });

  it("removes my photo", async () => {
    const app = await openProfile(withPhoto);
    app.client.answer("/v1/me/photo", () => ok(200, completeMe), "delete");
    await fireEvent.press(screen.getByRole("button", { name: "Remove photo" }));
    expect(await screen.findByText("Photo removed.")).toBeVisible();
    expect(screen.queryByTestId("avatar-photo", hidden)).toBeNull();
    expect(screen.getByRole("button", { name: "Add a photo" })).toBeVisible();
  });

  it("says ShareRide hid my photo, which only I still see, and lets me add another (spec 9, 3.4.3)", async () => {
    await openProfile({ ...completeMe, photo: { url: link, hidden: true } });
    expect(
      screen.getByText(
        "ShareRide hid your photo because it broke the Community Rules. Add another one.",
      ),
    ).toBeVisible();
    expect(screen.getByTestId("avatar-photo", hidden)).toHaveProp("source", { uri: link });
    expect(screen.getByRole("button", { name: "Change photo" })).toBeVisible();
  });

  it("shows my letter again when the photo does not load", async () => {
    await openProfile(withPhoto);
    await fireEvent(screen.getByTestId("avatar-photo", hidden), "error");
    expect(screen.queryByTestId("avatar-photo", hidden)).toBeNull();
    expect(screen.getByText("A", hidden)).toBeOnTheScreen();
  });
});

describe("photos beside names (spec 1, 3.5)", () => {
  const annasPhoto = "/v1/photo-files/profile-photos/0193f0c4-7d4a-7b1e-9c2a-123456789abd.jpg";

  it("shows the driver's photo on a trip, fetched from the API where it keeps them itself", async () => {
    await renderApp(`/trips/${northResult.tripId}?from=1&to=2`, {
      setUp: (client) => {
        tripDetailsApi(client, () =>
          ok(
            200,
            northTrip(
              { board: 1, alight: 2 },
              {
                driver: {
                  firstName: "Anna",
                  colour: 1,
                  profileId: null,
                  photo: annasPhoto,
                  ...newcomer,
                },
              },
            ),
          ),
        );
      },
    });
    expect(await screen.findByTestId("avatar-photo", hidden)).toHaveProp("source", {
      uri: `http://localhost:3000${annasPhoto}`,
    });
  });

  it("shows a person's photo on their profile", async () => {
    await renderApp(`/people/${annaProfileId}`, {
      me: completeMe,
      setUp: (client) => {
        profileApi(client, [{ ...annaProfile, photo: link }]);
      },
    });
    expect(await screen.findByRole("header", { name: "Anna" })).toBeVisible();
    expect(screen.getByTestId("avatar-photo", hidden)).toHaveProp("source", { uri: link });
  });
});
