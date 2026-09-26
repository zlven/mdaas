/**
 * `.txt` and `.md` — decoded in the browser, never uploaded.
 *
 * Encoding is not a formality here. A Chinese `.txt` written by Windows Notepad
 * is usually GBK, and decoding GBK bytes as UTF-8 produces a document made
 * entirely of replacement characters — which then parses "successfully", gets
 * injected into the prompt, and produces a confidently wrong answer about a file
 * the model cannot read. That is worse than a refusal, so it is worth detecting.
 *
 * The heuristic compares replacement-character counts rather than decoding
 * strictly, because `{ fatal: true }` is all-or-nothing: one bad byte in an
 * otherwise-valid UTF-8 file would flip the entire document to GBK and corrupt
 * the 99% that was fine.
 */

const REPLACEMENT = "�";

function replacementCount(text: string): number {
  let count = 0;
  for (const char of text) if (char === REPLACEMENT) count++;
  return count;
}

function decode(bytes: Uint8Array, label: string): string | null {
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    // An unrecognised label throws RangeError. `gbk` is part of the Encoding
    // Standard's mandatory set, so this should not happen — but a decoder that
    // is missing must degrade to "we could not do better", never to a crash.
    return null;
  }
}

/** Exported for the Node checks: this is the whole encoding decision, isolated. */
export function decodeText(bytes: Uint8Array): string {
  // A BOM is a declaration, not a guess — trust it and remove it, since it would
  // otherwise ride into the prompt as a zero-width character at the very start.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    // Node and browsers both support utf-16be in the Encoding Standard.
    return decode(bytes.subarray(2), "utf-16be") ?? new TextDecoder("utf-8").decode(bytes);
  }

  const asUtf8 = new TextDecoder("utf-8").decode(bytes);
  if (replacementCount(asUtf8) === 0) return asUtf8;

  const asGbk = decode(bytes, "gbk");
  if (asGbk !== null && replacementCount(asGbk) < replacementCount(asUtf8)) return asGbk;

  // Neither is clean. UTF-8 wins the tie: it is the declared default and the
  // one the user is most likely to have meant.
  return asUtf8;
}

export function parseTextFile(file: File): Promise<string> {
  return file.arrayBuffer().then((buffer) => decodeText(new Uint8Array(buffer)));
}
