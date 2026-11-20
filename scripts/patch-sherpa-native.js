const fs = require("fs");
const path = require("path");

const packageRoot = path.resolve("node_modules/react-native-sherpa-onnx");

function replaceExactlyOnce(relativePath, before, after, description) {
  const filePath = path.join(packageRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error("Sherpa native patch target is missing: " + relativePath);
  }
  const content = fs.readFileSync(filePath, "utf8");
  if (content.includes(after)) return;
  const matches = content.split(before).length - 1;
  if (matches !== 1) {
    throw new Error("Expected one unpatched " + description + " block in " + relativePath + ", found " + matches);
  }
  fs.writeFileSync(filePath, content.replace(before, after), "utf8");
  process.stdout.write("Patched " + description + "\n");
}

replaceExactlyOnce(
  "ios/SherpaOnnx.mm",
  `@implementation SherpaOnnx

+ (NSString *)moduleName
{
    return @"SherpaOnnx";
}

- (instancetype)init`,
  `@implementation SherpaOnnx

RCT_EXPORT_MODULE(SherpaOnnx)

- (instancetype)init`,
  "TurboModule registration"
);

replaceExactlyOnce(
  "ios/model_detect/sherpa-onnx-model-detect.h",
  `    std::string dataDir;
    std::string voices;`,
  `    std::string dataDir;
    std::string dictDir;
    std::string voices;`,
  "Kokoro dictionary path field"
);

replaceExactlyOnce(
  "ios/model_detect/sherpa-onnx-model-detect-tts.mm",
  `    std::string dataDirPath = FindDirectoryUnderRoot(files, modelDir, "espeak-ng-data");
    TTS_DETECT_LOGI`,
  `    std::string dataDirPath = FindDirectoryUnderRoot(files, modelDir, "espeak-ng-data");
    std::string dictDirPath = FindDirectoryUnderRoot(files, modelDir, "dict");
    TTS_DETECT_LOGI`,
  "Kokoro dictionary discovery"
);

replaceExactlyOnce(
  "ios/model_detect/sherpa-onnx-model-detect-tts.mm",
  `    std::string lexiconPath;
    for (const auto& c : lexiconCandidates) {
        result.lexiconLanguageCandidates.push_back(c.languageId);
    }
    if (!lexiconCandidates.empty()) {
        lexiconPath = lexiconCandidates[0].path;
    }`,
  `    std::string lexiconPath;
    for (const auto& c : lexiconCandidates) {
        result.lexiconLanguageCandidates.push_back(c.languageId);
    }
    if (selected == TtsModelKind::kKokoro) {
        for (size_t i = 0; i < lexiconCandidates.size(); ++i) {
            if (i > 0) lexiconPath += ",";
            lexiconPath += lexiconCandidates[i].path;
        }
    } else if (!lexiconCandidates.empty()) {
        lexiconPath = lexiconCandidates[0].path;
    }`,
  "bilingual Kokoro lexicon selection"
);

replaceExactlyOnce(
  "ios/model_detect/sherpa-onnx-model-detect-tts.mm",
  `    result.paths.dataDir = dataDirPath;
    result.paths.voices = voicesFile;`,
  `    result.paths.dataDir = dataDirPath;
    result.paths.dictDir = dictDirPath;
    result.paths.voices = voicesFile;`,
  "Kokoro dictionary path assignment"
);

replaceExactlyOnce(
  "ios/tts/sherpa-onnx-tts-wrapper.mm",
  `                config.model.kokoro.data_dir = detect.paths.dataDir;
                config.model.kokoro.voices = detect.paths.voices;`,
  `                config.model.kokoro.data_dir = detect.paths.dataDir;
                config.model.kokoro.dict_dir = detect.paths.dictDir;
                config.model.kokoro.voices = detect.paths.voices;`,
  "Kokoro dictionary runtime configuration"
);
