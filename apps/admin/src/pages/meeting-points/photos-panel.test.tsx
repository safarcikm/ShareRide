import {
  adminAddMeetingPointPhotoRoute,
  adminDescribeMeetingPointPhotoRoute,
  adminMeetingPointPhotosRoute,
  adminMeetingPointRoute,
  adminMeetingPointsRoute,
  adminMeRoute,
  adminOrderMeetingPointPhotosRoute,
  adminRemoveMeetingPointPhotoRoute,
  type AdminMe,
  type AdminMeetingPoint,
  type AdminMeetingPointPhoto,
} from "@shareride/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleApp } from "../../app.tsx";
import type { PhotoBrowser } from "../../photos.ts";
import { createFakeApi, createFakePasskeys } from "../../testing/fake-api.ts";

const anna: AdminMe = {
  userId: "0196f000-0000-7000-8000-000000000001",
  firstName: "Anna",
  locale: "en",
  sessionEndsAt: "2026-11-16T23:00:00.000Z",
};

const pointId = "0196f000-0000-7000-8000-0000000000a1";

/** A made-up draft at Borgarnes. */
const point: AdminMeetingPoint = {
  id: pointId,
  nameIs: "N1 Borgarnesi",
  nameEn: "N1 Borgarnes",
  aliases: [],
  position: { latitude: 64.5383, longitude: -21.9206 },
  region: "west",
  municipality: "Borgarbyggð",
  type: "fuel-station",
  amenities: ["toilets"],
  whereToStandIs: "Við inngang verslunarinnar.",
  whereToStandEn: "By the shop's entrance.",
  shelterHours: null,
  shelterNoteIs: null,
  shelterNoteEn: null,
  season: null,
  status: "draft",
  pauseReason: null,
  pausedUntil: null,
  lastCheckedOn: null,
  reviewDueOn: null,
  amenitiesReviewedOn: null,
  seasonReviewedOn: null,
  sample: false,
  futureTrips: 0,
  createdAt: "2026-11-16T10:00:00.000Z",
  updatedAt: "2026-11-16T10:00:00.000Z",
};

const photo = (number: number, descriptionEn: string): AdminMeetingPointPhoto => ({
  id: `0196f000-0000-7000-8000-00000000010${String(number)}`,
  url: `https://photos.test/meeting-points/0196f000-0000-7000-8000-00000000020${String(number)}.jpg`,
  descriptionIs: `Mynd ${String(number)}`,
  descriptionEn,
  width: 1600,
  height: 1200,
  updatedAt: "2026-11-16T11:00:00.000Z",
});

const entrance = photo(1, "The shop's entrance from the car park.");
const shelter = photo(2, "The bus shelter by the road.");

/** A small JPEG as the browser's canvas writes it, the picture only. */
const segment = (marker: number, data: readonly number[]) => [
  0xff,
  marker,
  (data.length + 2) >> 8,
  (data.length + 2) & 0xff,
  ...data,
];
const jpeg = Uint8Array.from([
  0xff,
  0xd8,
  ...segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]),
  ...segment(0xc0, [8, 0x04, 0xb0, 0x06, 0x40, 1, 1, 0x11, 0]),
  ...segment(0xc4, [0, 1, ...Array.from({ length: 15 }, () => 0), 0]),
  ...segment(0xda, [1, 1, 0, 0, 63, 0]),
  0x12,
  0x34,
  0xff,
  0xd9,
]);

function fakePhotos(result: () => Promise<Uint8Array> = () => Promise.resolve(jpeg)) {
  const prepared: Blob[] = [];
  const photos: PhotoBrowser = {
    prepare(file) {
      prepared.push(file);
      return result();
    },
  };
  return { photos, prepared };
}

function start(
  options: {
    readonly point?: AdminMeetingPoint;
    readonly photos?: readonly AdminMeetingPointPhoto[];
    readonly browser?: PhotoBrowser;
    readonly path?: string;
  } = {},
) {
  window.history.replaceState(null, "", options.path ?? `/admin/meeting-points/${pointId}`);
  const api = createFakeApi();
  api.on(adminMeRoute, { status: 200, data: anna });
  api.on(adminMeetingPointsRoute, { status: 200, data: { meetingPoints: [] } });
  api.on(adminMeetingPointRoute, { status: 200, data: options.point ?? point });
  api.on(adminMeetingPointPhotosRoute, {
    status: 200,
    data: { photos: options.photos ?? [entrance, shelter] },
  });
  render(
    <ConsoleApp
      client={api.client}
      passkeys={createFakePasskeys().passkeys}
      photos={options.browser ?? fakePhotos().photos}
    />,
  );
  return api;
}

const panel = () => screen.getByRole("region", { name: "Photos" });
const photoItem = (name: string) => within(panel()).getByRole("listitem", { name });
const chooseFile = (name = "entrance.jpg") => {
  const file = new File([Uint8Array.from([1, 2, 3])], name, { type: "image/jpeg" });
  fireEvent.change(within(panel()).getByLabelText("Photo"), { target: { files: [file] } });
  return file;
};
const typeIn = (scope: HTMLElement, label: string, value: string) => {
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });
};
const addForm = () => within(panel()).getByRole("group", { name: "Add a photo" });

describe("a meeting point's photos in the console (spec 2, 3.6.3)", () => {
  it("shows a saved point's photos in order, each with its descriptions", async () => {
    start();
    const list = await within(await screen.findByRole("region", { name: "Photos" })).findByRole(
      "list",
      { name: "The point's photos" },
    );
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => within(item).getByRole("img").getAttribute("alt"))).toEqual([
      entrance.descriptionEn,
      shelter.descriptionEn,
    ]);
    expect(
      within(items[0] as HTMLElement)
        .getByRole("img")
        .getAttribute("src"),
    ).toBe(entrance.url);
    expect(
      within(photoItem("Photo 1")).getByLabelText<HTMLTextAreaElement>(
        "Description for screen readers, in Icelandic",
      ).value,
    ).toBe("Mynd 1");
    expect(panel().textContent).toContain("2 of 5 photos");
  });

  it("has no photos for a new point until it is saved", async () => {
    start({ path: "/admin/meeting-points/new" });
    await screen.findByRole("heading", { name: "New meeting point", level: 1 });
    expect(screen.queryByRole("region", { name: "Photos" })).toBeNull();
  });

  it("makes a photo ready in the browser and adds it with both descriptions", async () => {
    const browser = fakePhotos();
    const api = start({ browser: browser.photos });
    await screen.findByRole("list", { name: "The point's photos" });
    const third = photo(3, "The sign at the turn-off.");
    api.on(adminAddMeetingPointPhotoRoute, {
      status: 201,
      data: { photos: [entrance, shelter, third] },
    });
    const file = chooseFile();
    typeIn(addForm(), "Description for screen readers, in Icelandic", "Skiltið við afleggjarann.");
    typeIn(addForm(), "Description for screen readers, in English", "The sign at the turn-off.");
    fireEvent.click(within(addForm()).getByRole("button", { name: "Add the photo" }));

    const added = await within(panel()).findByRole("status");
    expect(added.textContent).toBe("Photo added.");
    await waitFor(() => {
      expect(document.activeElement).toBe(added);
    });
    expect(browser.prepared).toEqual([file]);
    expect(api.called(adminAddMeetingPointPhotoRoute)).toEqual([
      {
        route: "POST /admin/v1/meeting-points/{id}/photos",
        input: {
          params: { id: pointId },
          body: {
            descriptionIs: "Skiltið við afleggjarann.",
            descriptionEn: "The sign at the turn-off.",
            file: Buffer.from(jpeg).toString("base64"),
          },
        },
      },
    ]);
    expect(within(panel()).getAllByRole("img")).toHaveLength(3);
    expect(
      within(addForm()).getByLabelText<HTMLTextAreaElement>(
        "Description for screen readers, in English",
      ).value,
    ).toBe("");
  });

  it("checks the photo and its descriptions before sending, the first problem taking the focus", async () => {
    const api = start();
    await screen.findByRole("list", { name: "The point's photos" });
    fireEvent.click(within(addForm()).getByRole("button", { name: "Add the photo" }));
    const fileField = within(addForm()).getByLabelText("Photo");
    await waitFor(() => {
      expect(document.activeElement).toBe(fileField);
    });
    expect(addForm().textContent).toContain("Choose a photo.");
    expect(addForm().textContent).toContain("Fill this in.");
    expect(fileField.getAttribute("aria-invalid")).toBe("true");
    expect(api.called(adminAddMeetingPointPhotoRoute)).toEqual([]);
  });

  it("says when the browser cannot read the file", async () => {
    const browser = fakePhotos(() => Promise.reject(new Error("test: not a picture")));
    const api = start({ browser: browser.photos });
    await screen.findByRole("list", { name: "The point's photos" });
    chooseFile("plan.pdf");
    typeIn(addForm(), "Description for screen readers, in Icelandic", "Skilti");
    typeIn(addForm(), "Description for screen readers, in English", "A sign");
    fireEvent.click(within(addForm()).getByRole("button", { name: "Add the photo" }));
    expect(
      await within(addForm()).findByText(
        "This browser cannot read the file. Choose a JPEG or PNG photo.",
      ),
    ).toBeTruthy();
    expect(api.called(adminAddMeetingPointPhotoRoute)).toEqual([]);
  });

  it("refuses a file that still carries metadata before sending it", async () => {
    const exif = [0xff, 0xe1, 0, 8, 0x45, 0x78, 0x69, 0x66, 0, 0];
    const withExif = Uint8Array.from([0xff, 0xd8, ...exif, ...jpeg.slice(2)]);
    const browser = fakePhotos(() => Promise.resolve(withExif));
    const api = start({ browser: browser.photos });
    await screen.findByRole("list", { name: "The point's photos" });
    chooseFile();
    typeIn(addForm(), "Description for screen readers, in Icelandic", "Skilti");
    typeIn(addForm(), "Description for screen readers, in English", "A sign");
    fireEvent.click(within(addForm()).getByRole("button", { name: "Add the photo" }));
    expect(
      await within(addForm()).findByText(
        "The photo still carries data besides the picture. Try another browser.",
      ),
    ).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(within(addForm()).getByLabelText("Photo"));
    });
    expect(api.called(adminAddMeetingPointPhotoRoute)).toEqual([]);
  });

  it("shows the API's problems by their fields, and says when no storage is set up", async () => {
    const api = start();
    await screen.findByRole("list", { name: "The point's photos" });
    api.on(adminAddMeetingPointPhotoRoute, {
      status: 400,
      error: { code: "validation_failed", details: [{ path: "file", issue: "metadata" }] },
    });
    chooseFile();
    typeIn(addForm(), "Description for screen readers, in Icelandic", "Skilti");
    typeIn(addForm(), "Description for screen readers, in English", "A sign");
    fireEvent.click(within(addForm()).getByRole("button", { name: "Add the photo" }));
    expect(
      await within(addForm()).findByText(
        "The photo still carries data besides the picture. Try another browser.",
      ),
    ).toBeTruthy();

    api.on(adminAddMeetingPointPhotoRoute, {
      status: 503,
      error: { code: "photo_storage_off" },
    });
    chooseFile();
    fireEvent.click(within(addForm()).getByRole("button", { name: "Add the photo" }));
    expect((await within(panel()).findByRole("alert")).textContent).toBe(
      "No photo storage is set up here, so photos cannot be added.",
    );
  });

  it("puts the focus on the message when the fifth photo takes the form's place", async () => {
    const four = [1, 2, 3, 4].map((number) => photo(number, `Photo ${String(number)}`));
    const api = start({ photos: four });
    await screen.findByRole("list", { name: "The point's photos" });
    api.on(adminAddMeetingPointPhotoRoute, {
      status: 201,
      data: { photos: [...four, photo(5, "Photo 5")] },
    });
    chooseFile();
    typeIn(addForm(), "Description for screen readers, in Icelandic", "Mynd 5");
    typeIn(addForm(), "Description for screen readers, in English", "Photo 5");
    fireEvent.click(within(addForm()).getByRole("button", { name: "Add the photo" }));
    const added = await within(panel()).findByRole("status");
    await waitFor(() => {
      expect(document.activeElement).toBe(added);
    });
    expect(within(panel()).queryByRole("group", { name: "Add a photo" })).toBeNull();
  });

  it("takes at most five photos", async () => {
    start({ photos: [1, 2, 3, 4, 5].map((number) => photo(number, `Photo ${String(number)}`)) });
    await screen.findByRole("list", { name: "The point's photos" });
    expect(panel().textContent).toContain(
      "A meeting point has at most five photos. Remove one to add another.",
    );
    expect(within(panel()).queryByRole("group", { name: "Add a photo" })).toBeNull();
  });

  it("saves a photo's descriptions with the copy it loaded, and loads the newest if it changed", async () => {
    const api = start();
    await screen.findByRole("list", { name: "The point's photos" });
    const changed = { ...shelter, descriptionEn: "The bus shelter, south side." };
    api.on(adminDescribeMeetingPointPhotoRoute, {
      status: 200,
      data: { photos: [entrance, { ...changed, updatedAt: "2026-11-16T12:00:00.000Z" }] },
    });
    typeIn(
      photoItem("Photo 2"),
      "Description for screen readers, in English",
      changed.descriptionEn,
    );
    fireEvent.click(
      within(photoItem("Photo 2")).getByRole("button", { name: "Save descriptions" }),
    );
    const saved = await within(panel()).findByRole("status");
    expect(saved.textContent).toBe("Descriptions saved.");
    await waitFor(() => {
      expect(document.activeElement).toBe(saved);
    });
    expect(api.called(adminDescribeMeetingPointPhotoRoute)[0]?.input).toEqual({
      params: { id: pointId, photoId: shelter.id },
      body: {
        descriptionIs: shelter.descriptionIs,
        descriptionEn: changed.descriptionEn,
        updatedAt: shelter.updatedAt,
      },
    });

    api.on(adminDescribeMeetingPointPhotoRoute, {
      status: 409,
      error: { code: "photo_changed" },
    });
    const newest = { ...entrance, descriptionEn: "Changed elsewhere." };
    api.on(adminMeetingPointPhotosRoute, { status: 200, data: { photos: [newest, changed] } });
    typeIn(photoItem("Photo 1"), "Description for screen readers, in English", "Mine.");
    fireEvent.click(
      within(photoItem("Photo 1")).getByRole("button", { name: "Save descriptions" }),
    );
    expect((await within(panel()).findByRole("status")).textContent).toBe(
      "This photo was changed elsewhere. This is the newest copy; make your change again.",
    );
    expect(
      within(photoItem("Photo 1")).getByLabelText<HTMLTextAreaElement>(
        "Description for screen readers, in English",
      ).value,
    ).toBe("Changed elsewhere.");
  });

  it("keeps what was typed for another photo when one is saved, moved or added", async () => {
    const api = start();
    await screen.findByRole("list", { name: "The point's photos" });
    typeIn(photoItem("Photo 2"), "Description for screen readers, in English", "Not saved yet.");
    const savedEntrance = {
      ...entrance,
      descriptionEn: "The entrance.",
      updatedAt: "2026-11-16T12:00:00.000Z",
    };
    api.on(adminDescribeMeetingPointPhotoRoute, {
      status: 200,
      data: { photos: [savedEntrance, shelter] },
    });
    typeIn(photoItem("Photo 1"), "Description for screen readers, in English", "The entrance.");
    fireEvent.click(
      within(photoItem("Photo 1")).getByRole("button", { name: "Save descriptions" }),
    );
    await within(panel()).findByText("Descriptions saved.");
    const typed = () =>
      within(photoItem("Photo 2")).getByLabelText<HTMLTextAreaElement>(
        "Description for screen readers, in English",
      ).value;
    expect(typed()).toBe("Not saved yet.");

    api.on(adminAddMeetingPointPhotoRoute, {
      status: 201,
      data: { photos: [savedEntrance, shelter, photo(3, "The sign.")] },
    });
    chooseFile();
    typeIn(addForm(), "Description for screen readers, in Icelandic", "Skiltið.");
    typeIn(addForm(), "Description for screen readers, in English", "The sign.");
    fireEvent.click(within(addForm()).getByRole("button", { name: "Add the photo" }));
    await within(panel()).findByText("Photo added.");
    expect(typed()).toBe("Not saved yet.");
  });

  it("checks a photo's descriptions before saving them", async () => {
    const api = start();
    await screen.findByRole("list", { name: "The point's photos" });
    typeIn(photoItem("Photo 1"), "Description for screen readers, in Icelandic", "  ");
    fireEvent.click(
      within(photoItem("Photo 1")).getByRole("button", { name: "Save descriptions" }),
    );
    expect(await within(photoItem("Photo 1")).findByText("Fill this in.")).toBeTruthy();
    expect(api.called(adminDescribeMeetingPointPhotoRoute)).toEqual([]);
  });

  it("moves a photo earlier or later, sending the whole order", async () => {
    const api = start();
    await screen.findByRole("list", { name: "The point's photos" });
    expect(within(photoItem("Photo 1")).queryByRole("button", { name: "Move earlier" })).toBeNull();
    expect(within(photoItem("Photo 2")).queryByRole("button", { name: "Move later" })).toBeNull();
    api.on(adminOrderMeetingPointPhotosRoute, {
      status: 200,
      data: { photos: [shelter, entrance] },
    });
    fireEvent.click(within(photoItem("Photo 2")).getByRole("button", { name: "Move earlier" }));
    const ordered = await within(panel()).findByText("Order saved.");
    // Read out from a region that was there before, as the focus stays on the photo.
    expect(ordered.closest("[aria-live='polite']")).not.toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(photoItem("Photo 1")).getByRole("button", { name: "Move later" }),
      );
    });
    expect(api.called(adminOrderMeetingPointPhotosRoute)[0]?.input).toEqual({
      params: { id: pointId },
      body: { order: [shelter.id, entrance.id] },
    });
    expect(within(photoItem("Photo 1")).getByRole("img").getAttribute("alt")).toBe(
      shelter.descriptionEn,
    );
  });

  it("removes a photo only after asking, and keeps it when the operator says so", async () => {
    const api = start();
    await screen.findByRole("list", { name: "The point's photos" });
    const removeButton = within(photoItem("Photo 2")).getByRole("button", { name: "Remove" });
    fireEvent.click(removeButton);
    const question = within(photoItem("Photo 2")).getByRole("group", { name: "Remove photo 2?" });
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(question).getByRole("button", { name: "Remove photo 2" }),
      );
    });
    fireEvent.click(within(question).getByRole("button", { name: "Keep it" }));
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(photoItem("Photo 2")).getByRole("button", { name: "Remove" }),
      );
    });
    expect(api.called(adminRemoveMeetingPointPhotoRoute)).toEqual([]);

    api.on(adminRemoveMeetingPointPhotoRoute, { status: 200, data: { photos: [entrance] } });
    fireEvent.click(within(photoItem("Photo 2")).getByRole("button", { name: "Remove" }));
    fireEvent.click(within(photoItem("Photo 2")).getByRole("button", { name: "Remove photo 2" }));
    const removed = await within(panel()).findByRole("status");
    expect(removed.textContent).toBe("Photo removed.");
    await waitFor(() => {
      expect(document.activeElement).toBe(removed);
    });
    expect(api.called(adminRemoveMeetingPointPhotoRoute)[0]?.input).toEqual({
      params: { id: pointId, photoId: shelter.id },
    });
    expect(within(panel()).getAllByRole("img")).toHaveLength(1);
  });

  it("loads the newest list when a photo was added or removed elsewhere", async () => {
    const api = start();
    await screen.findByRole("list", { name: "The point's photos" });
    api.on(adminOrderMeetingPointPhotosRoute, { status: 409, error: { code: "photos_changed" } });
    api.on(adminMeetingPointPhotosRoute, { status: 200, data: { photos: [entrance] } });
    fireEvent.click(within(photoItem("Photo 2")).getByRole("button", { name: "Move earlier" }));
    expect((await within(panel()).findByRole("status")).textContent).toBe(
      "A photo was added or removed elsewhere. This is the newest list; try again.",
    );
    expect(within(panel()).getAllByRole("img")).toHaveLength(1);
  });

  it("puts the focus on the message when a removal is refused", async () => {
    const api = start();
    await screen.findByRole("list", { name: "The point's photos" });
    api.on(adminRemoveMeetingPointPhotoRoute, { status: 404, error: { code: "not_found" } });
    api.on(adminMeetingPointPhotosRoute, { status: 200, data: { photos: [entrance] } });
    fireEvent.click(within(photoItem("Photo 2")).getByRole("button", { name: "Remove" }));
    fireEvent.click(within(photoItem("Photo 2")).getByRole("button", { name: "Remove photo 2" }));
    const refusedMessage = await within(panel()).findByRole("status");
    expect(refusedMessage.textContent).toBe(
      "A photo was added or removed elsewhere. This is the newest list; try again.",
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(refusedMessage);
    });
    await waitFor(() => {
      expect(within(panel()).getAllByRole("img")).toHaveLength(1);
    });
  });

  it("stops offering changes when the point was retired elsewhere", async () => {
    const api = start();
    await screen.findByRole("list", { name: "The point's photos" });
    api.on(adminOrderMeetingPointPhotosRoute, {
      status: 409,
      error: { code: "meeting_point_retired" },
    });
    fireEvent.click(within(photoItem("Photo 2")).getByRole("button", { name: "Move earlier" }));
    const retired = await within(panel()).findByRole("status");
    expect(retired.textContent).toBe(
      "This meeting point was retired, so its photos can no longer change.",
    );
    await waitFor(() => {
      expect(document.activeElement).toBe(retired);
    });
    expect(within(panel()).queryByRole("button")).toBeNull();
    expect(within(panel()).queryByRole("group", { name: "Add a photo" })).toBeNull();
    expect(within(panel()).getAllByRole("img")).toHaveLength(2);
  });

  it("shows a retired point's photos, with nothing to change", async () => {
    start({ point: { ...point, status: "retired" } });
    await screen.findByRole("list", { name: "The point's photos" });
    expect(within(panel()).queryByRole("button")).toBeNull();
    expect(within(panel()).queryByRole("textbox")).toBeNull();
    expect(within(panel()).getAllByRole("img")).toHaveLength(2);
  });

  it("offers to try again when the photos cannot be loaded", async () => {
    const api = createFakeApi();
    window.history.replaceState(null, "", `/admin/meeting-points/${pointId}`);
    api.on(adminMeRoute, { status: 200, data: anna });
    api.on(adminMeetingPointRoute, { status: 200, data: point });
    api.on(adminMeetingPointPhotosRoute, { status: 500, error: { code: "internal_error" } });
    render(
      <ConsoleApp
        client={api.client}
        passkeys={createFakePasskeys().passkeys}
        photos={fakePhotos().photos}
      />,
    );
    const failed = await screen.findByText("The photos could not be loaded.");
    expect(failed).toBeTruthy();
    api.on(adminMeetingPointPhotosRoute, { status: 200, data: { photos: [entrance] } });
    fireEvent.click(within(panel()).getByRole("button", { name: "Try again" }));
    expect(await within(panel()).findAllByRole("img")).toHaveLength(1);
  });
});
