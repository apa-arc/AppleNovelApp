const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Sherpa ONNX iOS detector prioritizes the Chinese Kokoro lexicon", () => {
  const sourcePath = path.join(
    process.cwd(),
    "node_modules/react-native-sherpa-onnx/ios/model_detect/sherpa-onnx-model-detect-helper.mm",
  );
  assert.ok(fs.existsSync(sourcePath), "Sherpa ONNX iOS detector source must exist");
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.match(source, /if \(a\.languageId == "zh"\) return true;/);
  assert.match(source, /if \(b\.languageId == "zh"\) return false;/);
});
