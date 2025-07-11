import type { AppConfig } from "./config.js";

import {
  getBaseUrl,
  getApiKey,
  AZURE_OPENAI_API_VERSION,
  OPENAI_TIMEOUT_MS,
  OPENAI_ORGANIZATION,
  OPENAI_PROJECT,
} from "./config.js";
import { exec } from "child_process";
import OpenAI, { AzureOpenAI } from "openai";

type OpenAIClientConfig = {
  provider: string;
};

/**
 * Creates an OpenAI client instance based on the provided configuration.
 * Handles both standard OpenAI and Azure OpenAI configurations.
 *
 * @param config The configuration containing provider information
 * @returns An instance of either OpenAI or AzureOpenAI client
 */
export function createOpenAIClient(
  config: OpenAIClientConfig | AppConfig,
): OpenAI | AzureOpenAI {
  const headers: Record<string, string> = {};
  if (OPENAI_ORGANIZATION) {
    headers["OpenAI-Organization"] = OPENAI_ORGANIZATION;
  }
  if (OPENAI_PROJECT) {
    headers["OpenAI-Project"] = OPENAI_PROJECT;
  }

  if (config.provider?.toLowerCase() === "azure") {
    return new AzureOpenAI({
      apiKey: getApiKey(config.provider),
      baseURL: getBaseUrl(config.provider),
      apiVersion: AZURE_OPENAI_API_VERSION,
      timeout: OPENAI_TIMEOUT_MS,
      defaultHeaders: headers,
    });
  }

  if (config.provider?.toLowerCase() === "gemini-cli") {
    return {
      chat: {
        completions: {
          create: async (params: {
            messages: Array<{ role: string; content: string }>;
            model?: string;
          }) => {
            const prompt = params.messages
              .map((m) => `${m.role}: ${m.content}`)
              .join("\n");
            return new Promise((resolve, reject) => {
              exec(
                `gemini "${prompt.replace(/"/g, '\\"')}"`,
                (err, stdout, _stderr) => {
                  if (err) {
                    reject(err);
                    return;
                  }
                  const text = stdout.toString().trim();
                  try {
                    const parsed = JSON.parse(text);
                    resolve(parsed);
                  } catch {
                    resolve({ choices: [{ message: { content: text } }] });
                  }
                },
              );
            });
          },
        },
      },
      models: {
        async *list() {
          // Attempt to list available models via CLI. Fallback to none.
          const output = await new Promise<string>((resolve) => {
            exec("gemini models --json", (err, stdout) =>
              resolve(err ? "" : stdout.toString()),
            );
          });
          try {
            const models = JSON.parse(output);
            if (Array.isArray(models)) {
              for (const id of models) {
                yield { id } as { id: string };
              }
            }
          } catch {
            // ignore parsing errors
          }
        },
      },
    } as unknown as OpenAI;
  }

  return new OpenAI({
    apiKey: getApiKey(config.provider),
    baseURL: getBaseUrl(config.provider),
    timeout: OPENAI_TIMEOUT_MS,
    defaultHeaders: headers,
  });
}
