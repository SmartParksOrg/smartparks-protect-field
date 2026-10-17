// Notarises the signed macOS app after electron-builder signs it, as AddaxAI's build does.
// Without Apple credentials in the environment it says so and skips, so a build on a machine
// without them still produces an app; REQUIRE_NOTARIZATION=1 (the release workflow) makes the
// missing credentials an error instead, so an unnotarised dmg never reaches a release.
const { notarize } = require("@electron/notarize");
const path = require("node:path");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") return;
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  if (!appleId || !appleIdPassword || !teamId) {
    const message = "No Apple credentials (APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID); the app is not notarised.";
    if (process.env.REQUIRE_NOTARIZATION === "1") throw new Error(message);
    console.log(`[notarize] ${message}`);
    return;
  }
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  console.log(`[notarize] Submitting ${appPath} to Apple`);
  await notarize({ tool: "notarytool", appPath, appleId, appleIdPassword, teamId });
  console.log("[notarize] Done");
};
