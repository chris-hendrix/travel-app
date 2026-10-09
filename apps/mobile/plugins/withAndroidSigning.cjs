/**
 * Release signing that survives `expo prebuild --clean`.
 *
 * Prebuild regenerates android/ from scratch, so a hand-edit of
 * android/app/build.gradle is overwritten. This config plugin instead
 * reads the upload keystore path/alias/passwords from gradle
 * properties (local: ~/.gradle/gradle.properties, CI: written from
 * secrets) and wires a `release` signingConfig at prebuild time.
 *
 * Properties read: JOURNIFUL_KEYSTORE, JOURNIFUL_KEY_ALIAS,
 * JOURNIFUL_STORE_PASSWORD, JOURNIFUL_KEY_PASSWORD.
 */
/* eslint-disable no-undef */
// @ts-nocheck — plain Node config plugin, no types by design.
const { withAppBuildGradle } = require("expo/config-plugins");

module.exports = function withAndroidSigning(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") return config;
    const anchor = "android {";
    if (
      config.modResults.contents.includes("journifulRelease") ||
      !config.modResults.contents.includes(anchor)
    ) {
      return config;
    }
    config.modResults.contents = config.modResults.contents.replace(
      anchor,
      `android {
    signingConfigs {
        journifulRelease {
            storeFile file(System.getProperty("JOURNIFUL_KEYSTORE") ?: (project.hasProperty("JOURNIFUL_KEYSTORE") ? project.property("JOURNIFUL_KEYSTORE") : System.getenv("JOURNIFUL_KEYSTORE")))
            storePassword System.getProperty("JOURNIFUL_STORE_PASSWORD") ?: (project.hasProperty("JOURNIFUL_STORE_PASSWORD") ? project.property("JOURNIFUL_STORE_PASSWORD") : System.getenv("JOURNIFUL_STORE_PASSWORD"))
            keyAlias System.getProperty("JOURNIFUL_KEY_ALIAS") ?: (project.hasProperty("JOURNIFUL_KEY_ALIAS") ? project.property("JOURNIFUL_KEY_ALIAS") : System.getenv("JOURNIFUL_KEY_ALIAS"))
            keyPassword System.getProperty("JOURNIFUL_KEY_PASSWORD") ?: (project.hasProperty("JOURNIFUL_KEY_PASSWORD") ? project.property("JOURNIFUL_KEY_PASSWORD") : System.getenv("JOURNIFUL_KEY_PASSWORD"))
        }
    }`,
    );
    // Point only the release build type at the upload key. The template
    // ships `signingConfig signingConfigs.debug` in release, and it is
    // not the first occurrence in the file (debug comes first), so this
    // anchors on the release block rather than on the string.
    const buildTypesAt = config.modResults.contents.indexOf("buildTypes");
    const releaseAt = config.modResults.contents.indexOf("release {", buildTypesAt);
    if (buildTypesAt !== -1 && releaseAt !== -1) {
      const head = config.modResults.contents.slice(0, releaseAt);
      const tail = config.modResults.contents.slice(releaseAt);
      config.modResults.contents =
        head + tail.replace("signingConfig signingConfigs.debug", "signingConfig signingConfigs.journifulRelease");
    } else {
      throw new Error(
        "withAndroidSigning: could not find buildTypes/release in android/app/build.gradle — the Expo template changed shape",
      );
    }
    return config;
  });
};
