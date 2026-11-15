// The app's own storage on iOS and Android: files in the app's documents
// folder, which go when the app is deleted. The file system is faked here.
import { readAppData, writeAppData } from "./app-data";

const mockFiles = new Map<string, string>();
let mockBroken = false;

jest.mock("expo-file-system", () => {
  class File {
    readonly uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(String).join("/");
    }
    get exists() {
      if (mockBroken) throw new Error("no access");
      return mockFiles.has(this.uri);
    }
    create() {
      if (mockFiles.has(this.uri)) throw new Error("already there");
      mockFiles.set(this.uri, "");
    }
    text() {
      return Promise.resolve(mockFiles.get(this.uri) ?? "");
    }
    write(content: string) {
      if (!mockFiles.has(this.uri)) return Promise.reject(new Error("no file"));
      mockFiles.set(this.uri, content);
      return Promise.resolve();
    }
  }
  return { File, Paths: { document: "documents" } };
});

beforeEach(() => {
  mockFiles.clear();
  mockBroken = false;
});

describe("the app's own storage", () => {
  it("has nothing for a key never written", async () => {
    expect(await readAppData("recentSearches")).toBeNull();
  });

  it("keeps a value in the app's documents folder, and replaces it", async () => {
    await writeAppData("recentSearches", "[1]");
    await writeAppData("recentSearches", "[2]");
    expect(await readAppData("recentSearches")).toBe("[2]");
    expect([...mockFiles.keys()]).toEqual(["documents/app-data/recentSearches.json"]);
  });

  it("does not fail when the storage cannot be used", async () => {
    mockBroken = true;
    await expect(writeAppData("recentSearches", "[1]")).resolves.toBeUndefined();
    expect(await readAppData("recentSearches")).toBeNull();
  });
});
