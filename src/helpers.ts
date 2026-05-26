/**
 * Check if a string is a valid JSON
 */
import lodash from "lodash";

const { camelCase, startCase } = lodash;
export function isJSONString(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch (error) {
    return false;
  }
}

export function getBetweenBrackets(value: string, start: string): string {
  let match = value.match(new RegExp(start + "\\(([^()]*)\\)", "g"));

  if (match !== null) {
    let m = match[0].replace(start + "(", "").replace(")", "");

    if (start !== "example") {
      m = m.replace(/ /g, "");
    }
    if (start === "paginated") {
      return "true";
    }
    return m;
  }

  return "";
}

export function mergeParams(
  initial: Record<string, unknown>,
  custom: Record<string, unknown>
): unknown[] {
  const merge = Object.assign(initial, custom);
  const params: unknown[] = [];
  for (const [, value] of Object.entries(merge)) {
    params.push(value);
  }

  return params;
}

/**
 * Helpers
 */

export function formatOperationId(inputString: string): string {
  // Remove non-alphanumeric characters and split the string into words
  const cleanedWords = inputString.replace(/[^a-zA-Z0-9]/g, " ").split(" ");

  // Pascal casing words
  const pascalCasedWords = cleanedWords.map((word) =>
    startCase(camelCase(word))
  );

  // Generate operationId by joining every parts
  const operationId = pascalCasedWords.join();

  // CamelCase the operationId
  return camelCase(operationId);
}
