import type { PiiType } from "@/domain/contracts";

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

const supportedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
]);

export class InvalidMediaError extends Error {}

export type PreparedMedia = {
  mimeType: string;
  bytes: Uint8Array;
  removedPiiTypes: PiiType[];
};

export function prepareMedia(input: {
  mimeType: string;
  dataBase64: string;
}): PreparedMedia {
  const mimeType = input.mimeType.trim().toLowerCase();
  if (!supportedMimeTypes.has(mimeType)) {
    throw new InvalidMediaError("지원하지 않는 미디어 MIME 형식입니다.");
  }

  const bytes = decodeStrictBase64(input.dataBase64);
  if (bytes.byteLength > MAX_MEDIA_BYTES) {
    throw new InvalidMediaError("미디어 입력은 8MB 이하여야 합니다.");
  }

  const detectedMimeType = detectMimeType(bytes);
  if (detectedMimeType !== mimeType) {
    throw new InvalidMediaError("선언한 MIME과 실제 파일 형식이 다릅니다.");
  }

  if (mimeType === "image/jpeg") {
    const stripped = stripJpegMetadata(bytes);
    return {
      mimeType,
      bytes: stripped.bytes,
      removedPiiTypes: stripped.removed ? ["EXIF"] : [],
    };
  }

  return { mimeType, bytes, removedPiiTypes: [] };
}

function decodeStrictBase64(value: string): Uint8Array {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new InvalidMediaError("올바른 base64 미디어가 아닙니다.");
  }

  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    throw new InvalidMediaError("올바른 base64 미디어가 아닙니다.");
  }
  return bytes;
}

function detectMimeType(bytes: Uint8Array): string | undefined {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    asciiAt(bytes, 8, "WEBP")
  ) {
    return "image/webp";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    asciiAt(bytes, 8, "WAVE")
  ) {
    return "audio/wav";
  }
  if (asciiAt(bytes, 0, "OggS")) return "audio/ogg";
  if (
    asciiAt(bytes, 0, "ID3") ||
    (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  ) {
    return "audio/mpeg";
  }
  if (bytes.length >= 12 && asciiAt(bytes, 4, "ftyp")) return "audio/mp4";
  return undefined;
}

function stripJpegMetadata(bytes: Uint8Array): {
  bytes: Uint8Array;
  removed: boolean;
} {
  const output: number[] = [0xff, 0xd8];
  let offset = 2;
  let removed = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff || offset + 1 >= bytes.length) {
      output.push(...bytes.subarray(offset));
      break;
    }

    const marker = bytes[offset + 1];
    if (marker === 0xd9) {
      output.push(0xff, marker);
      offset += 2;
      continue;
    }
    if (marker === 0xda) {
      output.push(...bytes.subarray(offset));
      break;
    }
    if (offset + 3 >= bytes.length) {
      throw new InvalidMediaError("손상된 JPEG 파일입니다.");
    }

    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
      throw new InvalidMediaError("손상된 JPEG 파일입니다.");
    }
    const segmentEnd = offset + 2 + segmentLength;
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) {
      removed = true;
    } else {
      output.push(...bytes.subarray(offset, segmentEnd));
    }
    offset = segmentEnd;
  }

  return { bytes: Uint8Array.from(output), removed };
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, value: string): boolean {
  return [...value].every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}
