const test = require("node:test");
const assert = require("node:assert/strict");
const { splitSpeechDialogue, buildFishAudioDialogueScript } = require("../.test-build/speech-dialogue.js");

test("splits narration and quoted dialogue with a named speaker", () => {
  const result = splitSpeechDialogue("夜色渐深。萧炎说道：“我会回来的。”他转身离开。");
  assert.deepEqual(result.map((item) => item.kind), ["narration", "dialogue", "narration"]);
  assert.equal(result[1].speakerName, "萧炎");
  assert.equal(result[1].text, "我会回来的。");
});

test("keeps ambiguous quoted dialogue unassigned", () => {
  const result = splitSpeechDialogue("“你来了？”她看向门口。");
  assert.equal(result[0].kind, "dialogue");
  assert.equal(result[0].speakerName, undefined);
});

test("supports full-width book quotes and CRLF", () => {
  const result = splitSpeechDialogue("甲说道：『出发。』\r\n");
  const dialogue = result.find((item) => item.kind === "dialogue");
  assert.ok(dialogue, "expected a dialogue segment");
  assert.equal(dialogue.speakerName, "甲");
  assert.equal(dialogue.text, "出发。");
});

test("creates Fish Audio speaker markers only for configured references", () => {
  const segments = splitSpeechDialogue("萧炎说道：“走。”");
  const script = buildFishAudioDialogueScript(segments, { "萧炎": "voice-a", "旁白": "voice-n" });
  assert.deepEqual(script.referenceIds, ["voice-n", "voice-a"]);
  assert.equal(script.text.includes("<|speaker:0|>"), true);
  assert.equal(script.text.includes("<|speaker:1|>走。"), true);
});

test("deduplicates references and never guesses a missing character voice", () => {
  const segments = [
    { kind: "dialogue", text: "你好。", speakerName: "未知角色" },
    { kind: "narration", text: "旁白。" },
  ];
  const script = buildFishAudioDialogueScript(segments, { "旁白": "voice-n" });
  assert.deepEqual(script.referenceIds, ["voice-n"]);
  assert.equal(script.text, "你好。\n<|speaker:0|>旁白。");
});
