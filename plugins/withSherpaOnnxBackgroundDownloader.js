const { withAppDelegate, withXcodeProject, IOSConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function addSwiftBackgroundSessionSupport(contents) {
  if (!contents.includes("handleEventsForBackgroundURLSession")) {
    const isExpoDelegate = /\bExpoAppDelegate\b/.test(contents);
    const forwardOtherSessions = isExpoDelegate
      ? "\n    guard identifier.hasSuffix(\".backgrounddownloadtask\") else {\n      return super.application(application, handleEventsForBackgroundURLSession: identifier, completionHandler: completionHandler)\n    }"
      : "";
    const method = "\n  " + (isExpoDelegate ? "public override func" : "func") + " application(\n" +
      "    _ application: UIApplication,\n" +
      "    handleEventsForBackgroundURLSession identifier: String,\n" +
      "    completionHandler: @escaping () -> Void\n" +
      "  ) {" + forwardOtherSessions + "\n" +
      "    RNBackgroundDownloader.setCompletionHandlerWithIdentifier(identifier, completionHandler: completionHandler)\n" +
      "  }\n";
    const classMatch = /^.*\bclass\s+AppDelegate\b.*$/m.exec(contents);
    const classEnd = classMatch ? /^}$/m.exec(contents.slice(classMatch.index)) : null;
    if (!classMatch || !classEnd) {
      throw new Error("Could not locate the AppDelegate class closing brace for background download support.");
    }
    const insertAt = classMatch.index + classEnd.index;
    contents = contents.slice(0, insertAt) + method + contents.slice(insertAt);
  }
  return contents;
}

function addBridgingHeaderImport(projectRoot, projectName) {
  const iosRoot = IOSConfig.Paths.getSourceRoot(projectRoot);
  const candidates = [
    path.join(iosRoot, projectName + "-Bridging-Header.h"),
    path.join(iosRoot, projectName, projectName + "-Bridging-Header.h"),
    path.join(iosRoot, "Bridging-Header.h"),
  ];
  let header = candidates.find((candidate) => fs.existsSync(candidate));
  if (!header) header = candidates[0];
  let contents = fs.existsSync(header) ? fs.readFileSync(header, "utf8") : "";
  const statement = "#import <RNBackgroundDownloader.h>";
  if (!contents.includes(statement)) {
    contents = contents.trim();
    contents = (contents ? contents + "\n" : "") + statement + "\n";
    fs.mkdirSync(path.dirname(header), { recursive: true });
    fs.writeFileSync(header, contents, "utf8");
  }
}

module.exports = function withSherpaOnnxBackgroundDownloader(config) {
  config = withAppDelegate(config, (config) => {
    if (config.modResults.language === "swift") {
      config.modResults.contents = addSwiftBackgroundSessionSupport(config.modResults.contents);
      addBridgingHeaderImport(config.modRequest.projectRoot, config.modRequest.projectName || "AppleNovelApp");
    } else {
      let contents = config.modResults.contents;
      if (!contents.includes("#import <RNBackgroundDownloader.h>")) {
        const lastReactImport = [...contents.matchAll(/#import <React\/.*?\.h>/g)].pop();
        if (lastReactImport) {
          const at = contents.lastIndexOf(lastReactImport[0]) + lastReactImport[0].length;
          contents = contents.slice(0, at) + "\n#import <RNBackgroundDownloader.h>" + contents.slice(at);
        }
      }
      if (!contents.includes("handleEventsForBackgroundURLSession")) {
        const method = "\n- (void)application:(UIApplication *)application handleEventsForBackgroundURLSession:(NSString *)identifier completionHandler:(void (^)(void))completionHandler\n{\n" +
          "  [RNBackgroundDownloader setCompletionHandlerWithIdentifier:identifier completionHandler:completionHandler];\n" +
          "}\n";
        const end = contents.lastIndexOf("@end");
        if (end < 0) throw new Error("Could not locate AppDelegate @end for background download support.");
        contents = contents.slice(0, end) + method + contents.slice(end);
      }
      config.modResults.contents = contents;
    }
    return config;
  });

  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName || "AppleNovelApp";
    const iosRoot = config.modRequest.platformProjectRoot;
    const sourceRoot = IOSConfig.Paths.getSourceRoot(config.modRequest.projectRoot);
    const headerPath = path.join(sourceRoot, `${projectName}-Bridging-Header.h`);
    const relativeHeaderPath = path.relative(iosRoot, headerPath).split(path.sep).join("/");
    const targets = project.pbxNativeTargetSection();
    const appTarget = Object.values(targets).find((target) =>
      target && target.isa === "PBXNativeTarget" && target.name === projectName
    );
    if (!appTarget) {
      throw new Error(`Could not find the ${projectName} Xcode target for Sherpa background downloads.`);
    }
    const configurationList = project.pbxXCConfigurationList()[appTarget.buildConfigurationList];
    const buildConfigurations = project.pbxXCBuildConfigurationSection();
    for (const item of configurationList.buildConfigurations) {
      const buildConfiguration = buildConfigurations[item.value];
      if (buildConfiguration && buildConfiguration.buildSettings) {
        buildConfiguration.buildSettings.SWIFT_OBJC_BRIDGING_HEADER = `"${relativeHeaderPath}"`;
      }
    }
    return config;
  });
};
