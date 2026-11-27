import { Platform } from "react-native";

/**
 * Whether the app runs as the website, for what only the website has, such
 * as its footer (spec 30, 3.3). A function, so tests can be the website.
 */
export const onWebsite = (): boolean => Platform.OS === "web";
