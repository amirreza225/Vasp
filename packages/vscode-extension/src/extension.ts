/**
 * extension.ts — VS Code extension entry point.
 *
 * Activated when VS Code opens a `.vasp` file (via `"activationEvents": ["onLanguage:vasp"]`).
 * Starts the Vasp language server and registers it with VS Code.
 */

import type * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";
import { createLanguageClient, stopLanguageClient } from "./client.js";

let languageClient: LanguageClient | undefined;

/**
 * Called by VS Code when the extension activates.
 */
export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  // Start the language client (which starts the server as a subprocess)
  languageClient = createLanguageClient(context);
  await languageClient.start();

  // Register the client for proper disposal on extension deactivation
  context.subscriptions.push({
    dispose: () => {
      stopLanguageClient().catch(console.error);
    },
  });
}

/**
 * Called by VS Code when the extension deactivates (window close, reload, etc).
 */
export async function deactivate(): Promise<void> {
  await stopLanguageClient();
}
