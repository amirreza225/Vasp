import type { StorageNode, StorageProvider } from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parseStorage(ctx: IParserContext): StorageNode {
  const loc = ctx.consume(TokenType.KW_STORAGE).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let provider: StorageProvider | null = null;
  let bucket: string | undefined;
  let maxSize: string | undefined;
  let allowedTypes: string[] | undefined;
  let publicPath: string | undefined;

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "provider":
        provider = ctx.consumeIdentifier().value as StorageProvider;
        break;
      case "bucket":
        bucket = ctx.consumeString();
        break;
      case "maxSize":
        maxSize = ctx.consumeString();
        break;
      case "allowedTypes":
        allowedTypes = ctx.parseStringArray();
        break;
      case "publicPath":
        publicPath = ctx.consumeString();
        break;
      default:
        throw ctx.error(
          "E055_UNKNOWN_PROP",
          `Unknown storage property '${key.value}'`,
          "Valid properties: provider, bucket, maxSize, allowedTypes, publicPath",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);

  if (!provider) {
    throw ctx.error(
      "E056_MISSING_STORAGE_PROVIDER",
      `Storage block '${name.value}' is missing a provider`,
      "Add: provider: local (or s3, r2, gcs)",
      loc,
    );
  }

  return {
    type: "Storage",
    name: name.value,
    loc,
    provider,
    ...(bucket !== undefined ? { bucket } : {}),
    ...(maxSize !== undefined ? { maxSize } : {}),
    ...(allowedTypes !== undefined ? { allowedTypes } : {}),
    ...(publicPath !== undefined ? { publicPath } : {}),
  };
}
