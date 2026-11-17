import { Linking } from "react-native";

/**
 * Opens a download link in the phone's browser, which saves the file
 * (plan 4.4: no new package is needed).
 */
export async function openDownload(url: string): Promise<void> {
  await Linking.openURL(url);
}
