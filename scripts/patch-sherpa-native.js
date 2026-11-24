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
  `#import <React/RCTLog.h>
#import <AVFoundation/AVFoundation.h>`,
  `#import <React/RCTLog.h>
#import <React/RCTBridgeModule.h>
#import <AVFoundation/AVFoundation.h>`,
  "RCTBridgeModule macro import"
);

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

replaceExactlyOnce(
  "ios/tts/sherpa-onnx-tts-wrapper.h",
  `        int32_t sampleRate;          // Sample rate in Hz
    };`,
  `        int32_t sampleRate;          // Sample rate in Hz
        std::string error;             // Native synthesis error, preserved for JS diagnostics
    };`,
  "TTS synthesis error field"
);

replaceExactlyOnce(
  "ios/tts/sherpa-onnx-tts-wrapper.mm",
  `        result.samples = std::move(audio.samples);
        result.sampleRate = audio.sample_rate;

        LOGI("TTS: Generated %zu samples at %d Hz",
             result.samples.size(), result.sampleRate);

        return result;`,
  `        result.samples = std::move(audio.samples);
        result.sampleRate = audio.sample_rate;

        LOGI("TTS: Generated %zu samples at %d Hz",
             result.samples.size(), result.sampleRate);
        if (result.samples.empty() || result.sampleRate <= 0) {
            result.error = "Native Generate returned empty PCM; sid=" + std::to_string(sid) +
                ", engineSampleRate=" + std::to_string(pImpl->tts.value().SampleRate()) +
                ", speakerCount=" + std::to_string(pImpl->tts.value().NumSpeakers()) +
                ", textLength=" + std::to_string(text.size());
            LOGE("TTS: %s", result.error.c_str());
        }

        return result;`,
  "diagnose empty Kokoro PCM output"
);

replaceExactlyOnce(
  "ios/tts/sherpa-onnx-tts-wrapper.mm",
  `    } catch (const std::exception& e) {
        LOGE("TTS: Exception during generation: %s", e.what());
        return result;
    } catch (...) {
        LOGE("TTS: Unknown exception during generation");
        return result;
    }`,
  `    } catch (const std::exception& e) {
        result.error = e.what();
        LOGE("TTS: Exception during generation: %s", e.what());
        return result;
    } catch (...) {
        result.error = "Unknown native exception during TTS generation";
        LOGE("TTS: Unknown exception during generation");
        return result;
    }`,
  "preserve Kokoro generation exceptions"
);

replaceExactlyOnce(
  "ios/SherpaOnnx+TTS.mm",
  `        if (result.samples.empty() || result.sampleRate == 0) {
            NSString *errorMsg = @"Failed to generate speech or result is empty";
            RCTLogError(@"%@", errorMsg);`,
  `        if (result.samples.empty() || result.sampleRate == 0) {
            NSString *detail = result.error.empty()
                ? [NSString stringWithFormat:@"native output was empty (sampleRate=%d)", result.sampleRate]
                : [NSString stringWithUTF8String:result.error.c_str()];
            NSString *errorMsg = [@"Kokoro synthesis failed: " stringByAppendingString:detail];
            RCTLogError(@"%@", errorMsg);`,
  "surface native Kokoro generation failure"
);

const imageSizeUtilsPath = path.resolve("node_modules/image-size/dist/cjs/types/utils.js");
if (!fs.existsSync(imageSizeUtilsPath)) {
  throw new Error("image-size utility patch target is missing: " + imageSizeUtilsPath);
}
{
  const before = "const toUTF8String = (input, start = 0, end = input.length) => decoder.decode(input.slice(start, end));";
  const after = "const toUTF8String = (input, start = 0, end = input.length) => {\\n  const bytes = input instanceof ArrayBuffer\\n    ? new Uint8Array(input)\\n    : ArrayBuffer.isView(input)\\n      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)\\n      : Uint8Array.from(input);\\n  return decoder.decode(bytes.subarray(start, end));\\n};";
  const viewBefore = "const getView = (input, offset) => new DataView(input.buffer, input.byteOffset + offset);";
  const viewAfter = "const getView = (input, offset) => {\\n  // Metro may pass Uint8Array-compatible data backed by a non-ArrayBuffer.\\n  // DataView requires an actual ArrayBuffer, so copy only in that case.\\n  const bytes = input.buffer instanceof ArrayBuffer ? input : Uint8Array.from(input);\\n  return new DataView(bytes.buffer, bytes.byteOffset + offset);\\n};";
  const content = fs.readFileSync(imageSizeUtilsPath, "utf8");
  let patched = content;
  if (!patched.includes(after)) {
    const matches = patched.split(before).length - 1;
    if (matches !== 1) {
      throw new Error("Expected one unpatched image-size UTF-8 decoder block, found " + matches);
    }
    patched = patched.replace(before, after);
    process.stdout.write("Patched image-size byte input normalization for Metro compatibility\\n");
  }
  if (!patched.includes(viewAfter)) {
    const matches = patched.split(viewBefore).length - 1;
    if (matches !== 1) {
      throw new Error("Expected one unpatched image-size DataView block, found " + matches);
    }
    patched = patched.replace(viewBefore, viewAfter);
    process.stdout.write("Patched image-size DataView backing buffer for Metro compatibility\\n");
  }
  if (patched !== content) fs.writeFileSync(imageSizeUtilsPath, patched, "utf8");
}
