/**
 * client.ts — LanguageClient setup for the Vasp VS Code extension.
 *
 * Spawns the Vasp language server (`@vasp-framework/language-server`) as a
 * child Node.js process and connects it to VS Code via stdio transport.
 *
 * The language server path is resolved relative to this extension's install
 * directory so it works correctly in both development (monorepo) and when
 * the extension is packaged as a .vsix.
 */

import * as path from "path";
import * as vscode from "vscode";
import type {
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";
import { LanguageClient, TransportKind } from "vscode-languageclient/node";

let client: LanguageClient | undefined;

/**
 * Create and return a LanguageClient connected to the Vasp language server.
 *
 * @param context — The VS Code extension context (used to resolve paths).
 */
export function createLanguageClient(
  context: vscode.ExtensionContext,
): LanguageClient {
  // Resolve the language server's built entry point.
  // When packaged as a .vsix, the language server dist is bundled under
  // `./language-server/dist/server.js` relative to the extension root
  // (copied in by the vsce build step or Makefile).
  // In local development, set the `VASP_LS_PATH` environment variable to
  // point to an absolute path of the built server.js, e.g.:
  //   VASP_LS_PATH=$(pwd)/../../language-server/dist/server.js code .
  const serverModule =
    process.env["VASP_LS_PATH"] ??
    context.asAbsolutePath(path.join("language-server", "dist", "server.js"));

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.stdio,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: {
        execArgv: ["--nolazy", "--inspect=6009"],
      },
    },
  };

  const clientOptions: LanguageClientOptions = {
    // Only activate for .vasp files
    documentSelector: [{ scheme: "file", language: "vasp" }],
    synchronize: {
      // Watch for changes to .vasp files in the workspace (multi-file support)
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.vasp"),
    },
  };

  client = new LanguageClient(
    "vasp-language-server",
    "Vasp Language Server",
    serverOptions,
    clientOptions,
  );

  return client;
}

/**
 * Stop and dispose the language client.
 */
export async function stopLanguageClient(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
}
