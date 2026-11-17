import type { PhotoStorageConfig } from "../config.ts";
import { createHetznerPhotoStorage } from "./photo-storage-hetzner.ts";
import {
  createFolderPhotoStorage,
  type FolderPhotoStorage,
  type PhotoStorage,
} from "./photo-storage.ts";

/**
 * The photo storage the configuration asks for (ADR 0022). A folder is
 * also `photoFiles`, whose files the API serves itself; none means photos
 * are off: none are taken and the app shows none.
 */
export function selectPhotoStorage(config: PhotoStorageConfig): {
  readonly photos?: PhotoStorage;
  readonly photoFiles?: FolderPhotoStorage;
} {
  switch (config.provider) {
    case "none":
      return {};
    case "folder": {
      const folder = createFolderPhotoStorage(config.folder);
      return { photos: folder, photoFiles: folder };
    }
    case "hetzner":
      return {
        photos: createHetznerPhotoStorage({
          endpoint: config.endpoint,
          bucket: config.bucket,
          accessKey: config.accessKey,
          secretKey: config.secretKey,
        }),
      };
  }
}
