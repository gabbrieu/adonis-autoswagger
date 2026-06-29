import assert from "node:assert/strict";
import test from "node:test";

import { ModelParser } from "../dist/parsers.js";

const source: string = `
export default class Example {
  // @required
  declare accountId: number

  // @required
  declare pdvInfo: string
}
`;

test("required fields match snake_case property names", () => {
  const result = new ModelParser(true).parseModelProperties(source);

  assert.deepEqual(result.required, ["account_id", "pdv_info"]);
  assert.deepEqual(Object.keys(result.props), ["account_id", "pdv_info"]);
});

test("required fields match unchanged property names", () => {
  const result = new ModelParser(false).parseModelProperties(source);

  assert.deepEqual(result.required, ["accountId", "pdvInfo"]);
  assert.deepEqual(Object.keys(result.props), ["accountId", "pdvInfo"]);
});
