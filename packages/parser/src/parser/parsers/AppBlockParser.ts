import type {
  AppNode,
  AppUIConfig,
  EnvRequirement,
  EnvVarDefinition,
  EnvVarType,
  EnvVarValidation,
  MultiTenantConfig,
  MultiTenantStrategy,
  UITheme,
  UIPrimaryColor,
} from "@vasp-framework/core";
import {
  SUPPORTED_UI_THEMES,
  SUPPORTED_UI_PRIMARY_COLORS,
} from "@vasp-framework/core";
import { TokenType } from "../../lexer/TokenType.js";
import type { IParserContext } from "../ParserContext.js";

export function parseApp(ctx: IParserContext): AppNode {
  const loc = ctx.consume(TokenType.KW_APP).loc;
  const name = ctx.consumeIdentifier();
  ctx.consume(TokenType.LBRACE);

  let title = "";
  let db = "Drizzle" as const;
  let ssr: boolean | "ssg" = false;
  let typescript = false;
  const env: Record<string, EnvVarDefinition> = {};
  let multiTenant: MultiTenantConfig | undefined;
  let ui: AppUIConfig | undefined;

  while (!ctx.check(TokenType.RBRACE)) {
    const key = ctx.consumeIdentifier();
    ctx.consume(TokenType.COLON);

    switch (key.value) {
      case "title":
        title = ctx.consumeString();
        if (!title.trim()) {
          throw ctx.error(
            "E046_EMPTY_APP_TITLE",
            "App title cannot be empty",
            'Provide a non-empty title: title: "MyApp"',
            ctx.peek().loc,
          );
        }
        break;
      case "db":
        db = ctx.consumeIdentifier().value as "Drizzle";
        break;
      case "ssr": {
        const val = ctx.peek();
        if (val.type === TokenType.BOOLEAN) {
          ssr = ctx.consume(TokenType.BOOLEAN).value === "true";
        } else if (val.type === TokenType.STRING) {
          const s = ctx.consumeString();
          if (s !== "ssg") {
            throw ctx.error(
              "E011_INVALID_SSR",
              `Invalid ssr value "${s}"`,
              'Use: false, true, or "ssg"',
              val.loc,
            );
          }
          ssr = "ssg";
        } else {
          throw ctx.error(
            "E011_INVALID_SSR",
            "Invalid ssr value",
            'Use: false, true, or "ssg"',
            val.loc,
          );
        }
        break;
      }
      case "typescript":
        typescript = ctx.consume(TokenType.BOOLEAN).value === "true";
        break;
      case "env": {
        ctx.consume(TokenType.LBRACE);
        while (!ctx.check(TokenType.RBRACE)) {
          const envKey = ctx.consumeIdentifier().value;
          ctx.consume(TokenType.COLON);
          const requirementToken = ctx.consumeIdentifier();
          const requirement = requirementToken.value as EnvRequirement;

          if (requirement !== "required" && requirement !== "optional") {
            throw ctx.error(
              "E038_INVALID_ENV_REQUIREMENT",
              `Invalid env requirement '${requirement}' for '${envKey}'`,
              "Use required or optional",
              requirementToken.loc,
            );
          }

          if (envKey in env) {
            throw ctx.error(
              "E039_DUPLICATE_ENV_KEY",
              `Duplicate env key '${envKey}' in app.env`,
              "Each env key must be declared once",
              ctx.peek().loc,
            );
          }

          // Parse type (String, Int, Boolean, Enum)
          const typeToken = ctx.consumeIdentifier();
          const envType = typeToken.value as EnvVarType;
          const validEnvTypes = new Set<string>([
            "String",
            "Int",
            "Boolean",
            "Enum",
          ]);
          if (!validEnvTypes.has(envType)) {
            throw ctx.error(
              "E040_INVALID_ENV_TYPE",
              `Invalid env type '${envType}' for '${envKey}'`,
              "Use String, Int, Boolean, or Enum",
              typeToken.loc,
            );
          }

          let enumValues: string[] | undefined;
          if (envType === "Enum") {
            ctx.consume(TokenType.LPAREN);
            enumValues = [];
            const seenVariants = new Set<string>();
            while (!ctx.check(TokenType.RPAREN)) {
              const variant = ctx.consumeIdentifier();
              if (seenVariants.has(variant.value)) {
                throw ctx.error(
                  "E041_DUPLICATE_ENV_ENUM_VARIANT",
                  `Duplicate enum variant '${variant.value}' for env key '${envKey}'`,
                  "Each enum variant must be unique",
                  variant.loc,
                );
              }
              seenVariants.add(variant.value);
              enumValues.push(variant.value);
              if (ctx.check(TokenType.COMMA)) ctx.consume(TokenType.COMMA);
            }
            ctx.consume(TokenType.RPAREN);
            if (enumValues.length === 0) {
              throw ctx.error(
                "E042_EMPTY_ENV_ENUM",
                `Env var '${envKey}' of type Enum must have at least one variant`,
                "Example: NODE_ENV: required Enum(development, production)",
                typeToken.loc,
              );
            }
          }

          // Parse optional modifiers: @default(...), @minLength(...), @maxLength(...),
          // @startsWith(...), @endsWith(...), @min(...), @max(...)
          let defaultValue: string | undefined;
          const validation: EnvVarValidation = {};
          while (ctx.check(TokenType.AT_MODIFIER)) {
            const mod = ctx.consume(TokenType.AT_MODIFIER);
            const modVal = mod.value;
            if (modVal.startsWith("default_")) {
              defaultValue = modVal.slice("default_".length);
            } else if (modVal.startsWith("minLength_")) {
              validation.minLength = Number(modVal.slice("minLength_".length));
            } else if (modVal.startsWith("maxLength_")) {
              validation.maxLength = Number(modVal.slice("maxLength_".length));
            } else if (modVal.startsWith("startsWith_")) {
              validation.startsWith = modVal.slice("startsWith_".length);
            } else if (modVal.startsWith("endsWith_")) {
              validation.endsWith = modVal.slice("endsWith_".length);
            } else if (modVal.startsWith("min_")) {
              validation.min = Number(modVal.slice("min_".length));
            } else if (modVal.startsWith("max_")) {
              validation.max = Number(modVal.slice("max_".length));
            }
            // Unknown env modifiers silently ignored (forward-compat)
          }

          const def: EnvVarDefinition = { requirement, type: envType };
          if (enumValues !== undefined) def.enumValues = enumValues;
          if (defaultValue !== undefined) def.defaultValue = defaultValue;
          if (Object.keys(validation).length > 0) def.validation = validation;

          env[envKey] = def;
          if (ctx.check(TokenType.COMMA)) ctx.consume(TokenType.COMMA);
        }
        ctx.consume(TokenType.RBRACE);
        break;
      }
      case "multiTenant": {
        ctx.consume(TokenType.LBRACE);
        let strategy: MultiTenantStrategy = "row-level";
        let tenantEntity = "";
        let tenantField = "";
        while (!ctx.check(TokenType.RBRACE)) {
          const mtKey = ctx.consumeIdentifier();
          ctx.consume(TokenType.COLON);
          switch (mtKey.value) {
            case "strategy": {
              const stratVal = ctx.consumeString();
              strategy = stratVal as MultiTenantStrategy;
              break;
            }
            case "tenantEntity":
              tenantEntity = ctx.consumeIdentifier().value;
              break;
            case "tenantField":
              tenantField = ctx.consumeIdentifier().value;
              break;
            default:
              throw ctx.error(
                "E047_UNKNOWN_MULTITENANT_PROP",
                `Unknown multiTenant property '${mtKey.value}'`,
                "Valid properties: strategy, tenantEntity, tenantField",
                mtKey.loc,
              );
          }
        }
        ctx.consume(TokenType.RBRACE);
        multiTenant = { strategy, tenantEntity, tenantField };
        break;
      }
      case "ui": {
        ctx.consume(TokenType.LBRACE);
        let uiTheme: UITheme = "Aura";
        let uiPrimaryColor: UIPrimaryColor | undefined;
        let uiDarkModeSelector = ".app-dark";
        let uiRipple = true;
        while (!ctx.check(TokenType.RBRACE)) {
          const uiKey = ctx.consumeIdentifier();
          ctx.consume(TokenType.COLON);
          switch (uiKey.value) {
            case "theme": {
              const themeToken = ctx.consumeIdentifier();
              if (
                !(SUPPORTED_UI_THEMES as readonly string[]).includes(
                  themeToken.value,
                )
              ) {
                throw ctx.error(
                  "E048_INVALID_UI_THEME",
                  `Invalid ui.theme '${themeToken.value}'`,
                  `Valid themes: ${SUPPORTED_UI_THEMES.join(", ")}`,
                  themeToken.loc,
                );
              }
              uiTheme = themeToken.value as UITheme;
              break;
            }
            case "primaryColor": {
              const colorToken = ctx.consumeIdentifier();
              if (
                !(SUPPORTED_UI_PRIMARY_COLORS as readonly string[]).includes(
                  colorToken.value,
                )
              ) {
                throw ctx.error(
                  "E049_INVALID_UI_PRIMARY_COLOR",
                  `Invalid ui.primaryColor '${colorToken.value}'`,
                  `Valid colors: ${SUPPORTED_UI_PRIMARY_COLORS.join(", ")}`,
                  colorToken.loc,
                );
              }
              uiPrimaryColor = colorToken.value as UIPrimaryColor;
              break;
            }
            case "darkModeSelector":
              uiDarkModeSelector = ctx.consumeString();
              break;
            case "ripple":
              uiRipple = ctx.consume(TokenType.BOOLEAN).value === "true";
              break;
            default:
              throw ctx.error(
                "E050_UNKNOWN_UI_PROP",
                `Unknown ui property '${uiKey.value}'`,
                "Valid properties: theme, primaryColor, darkModeSelector, ripple",
                uiKey.loc,
              );
          }
        }
        ctx.consume(TokenType.RBRACE);
        ui = {
          theme: uiTheme,
          ...(uiPrimaryColor !== undefined
            ? { primaryColor: uiPrimaryColor }
            : {}),
          darkModeSelector: uiDarkModeSelector,
          ripple: uiRipple,
        };
        break;
      }
      default:
        throw ctx.error(
          "E012_UNKNOWN_PROP",
          `Unknown app property '${key.value}'`,
          "Valid properties: title, db, ssr, typescript, env, multiTenant, ui",
          key.loc,
        );
    }
  }

  ctx.consume(TokenType.RBRACE);
  return {
    type: "App",
    name: name.value,
    loc,
    title,
    db,
    ssr,
    typescript,
    ...(Object.keys(env).length > 0 ? { env } : {}),
    ...(multiTenant !== undefined ? { multiTenant } : {}),
    ...(ui !== undefined ? { ui } : {}),
  };
}
