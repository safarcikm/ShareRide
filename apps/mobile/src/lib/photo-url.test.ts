import { photoUrl } from "./photo-url";

describe("photoUrl", () => {
  it("fetches a path on the API from the API", () => {
    expect(photoUrl("/v1/photo-files/a.jpg", "http://192.168.1.5:3000")).toBe(
      "http://192.168.1.5:3000/v1/photo-files/a.jpg",
    );
  });

  it("does not double the slash when the API's address ends in one", () => {
    expect(photoUrl("/v1/photo-files/a.jpg", "https://api.example.com/")).toBe(
      "https://api.example.com/v1/photo-files/a.jpg",
    );
  });

  it("keeps a path that starts with two slashes on the API", () => {
    expect(photoUrl("//elsewhere.example.com/a.jpg", "https://api.example.com")).toBe(
      "https://api.example.com//elsewhere.example.com/a.jpg",
    );
  });

  it("leaves a signed link to the bucket as it is", () => {
    const signed = "https://photos.example.com/a.jpg?X-Amz-Signature=abc";
    expect(photoUrl(signed, "https://api.example.com")).toBe(signed);
  });
});
