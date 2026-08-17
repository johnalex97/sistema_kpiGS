export interface EvidenceFormat {
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  extension: "jpg" | "png" | "webp" | "pdf";
}

export class InvalidEvidenceFileError extends Error {
  readonly code = "INVALID_EVIDENCE_FILE" as const;

  constructor(message: string) {
    super(message);
    this.name = "InvalidEvidenceFileError";
  }
}

type EvidenceFormatDefinition = EvidenceFormat & {
  suffixes: readonly string[];
  signature: readonly (number | null)[];
};

const formats: readonly EvidenceFormatDefinition[] = [
  {
    mimeType: "image/jpeg",
    extension: "jpg",
    suffixes: ["jpg", "jpeg"],
    signature: [0xff, 0xd8, 0xff],
  },
  {
    mimeType: "image/png",
    extension: "png",
    suffixes: ["png"],
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  {
    mimeType: "image/webp",
    extension: "webp",
    suffixes: ["webp"],
    signature: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
  },
  {
    mimeType: "application/pdf",
    extension: "pdf",
    suffixes: ["pdf"],
    signature: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
];

function invalid(message: string): never {
  throw new InvalidEvidenceFileError(message);
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
}

function hasSignature(
  head: Buffer,
  signature: readonly (number | null)[],
): boolean {
  if (head.length < signature.length) {
    return false;
  }

  return signature.every((byte, index) => byte === null || head[index] === byte);
}

function finalSuffix(name: string): string {
  const finalDot = name.lastIndexOf(".");
  return finalDot < 0 ? "" : name.slice(finalDot + 1).toLowerCase();
}

function findFormat(mimeType: string, suffix: string): EvidenceFormatDefinition | undefined {
  return formats.find(
    (format) =>
      format.mimeType === mimeType && format.suffixes.includes(suffix),
  );
}

function stripUnsafeCharacters(name: string): string {
  return Array.from(name)
    .filter((character) => character !== "\\" && character !== "/" && !isControlCharacter(character))
    .join("");
}

function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";

  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes) {
      break;
    }
    result += character;
    bytes += characterBytes;
  }

  return result;
}

export function detectEvidenceFormat(input: {
  originalName: string;
  declaredMimeType: string;
  head: Buffer;
  sizeBytes: number;
}): EvidenceFormat {
  if (
    typeof input.originalName !== "string" ||
    input.originalName.length === 0 ||
    /[\\/]/u.test(input.originalName) ||
    Array.from(input.originalName).some(isControlCharacter)
  ) {
    return invalid("Evidence filename contains invalid characters");
  }

  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    return invalid("Evidence file must not be empty");
  }

  const format = findFormat(input.declaredMimeType, finalSuffix(input.originalName));
  if (format === undefined) {
    return invalid("Evidence MIME type and final filename suffix do not agree");
  }

  if (input.sizeBytes < format.signature.length) {
    return invalid("Evidence file is shorter than its required signature");
  }

  if (!hasSignature(input.head, format.signature)) {
    return invalid("Evidence content signature does not match its declared format");
  }

  return { mimeType: format.mimeType, extension: format.extension };
}

export function normalizeDownloadName(
  originalName: string,
  extension: EvidenceFormat["extension"],
): string {
  const canonicalExtensions: readonly EvidenceFormat["extension"][] = ["jpg", "png", "webp", "pdf"];
  if (!canonicalExtensions.includes(extension)) {
    return invalid("Evidence extension is not supported");
  }

  const safeName = stripUnsafeCharacters(originalName);
  const suffix = `.${extension}`;
  const suffixPattern = /\.(?:jpg|jpeg|png|webp|pdf)$/iu;
  let stem = safeName;
  while (suffixPattern.test(stem)) {
    stem = stem.replace(suffixPattern, "");
  }
  if (stem.length === 0) {
    return invalid("Evidence download name is empty");
  }

  const maxStemBytes = 255 - Buffer.byteLength(suffix, "utf8");
  const truncatedStem = truncateUtf8(stem, maxStemBytes);
  if (truncatedStem.length === 0) {
    return invalid("Evidence download name is empty");
  }

  return `${truncatedStem}${suffix}`;
}
