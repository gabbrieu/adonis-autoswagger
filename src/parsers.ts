import lodash from "lodash";
import ExampleGenerator from "./example.js";
import { getBetweenBrackets, isJSONString } from "./helpers.js";
import type { AutoSwaggerOptions } from "./types.js";
import type { AutoSwaggerVineValidator } from "./decorators.js";
import { standardTypes } from "./types.js";

const { snakeCase, startCase } = lodash;

function inferEnumType(values: any[]): string {
  if (values.length === 0) return "string";
  if (values.every((value) => typeof value === "number")) {
    return values.every((value) => Number.isInteger(value))
      ? "integer"
      : "number";
  }
  if (values.every((value) => typeof value === "boolean")) return "boolean";
  return "string";
}

function enumSchema(values: any[]): Record<string, any> {
  const type = inferEnumType(values);

  return {
    type,
    enum: values,
    example:
      values.length > 0
        ? values[0]
        : new ExampleGenerator({}).exampleByType(type),
  };
}

function parseLiteralUnionType(type: string): any[] | null {
  const values = type
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part !== "" && part !== "null" && part !== "undefined")
    .map((part) => {
      if (
        (part.startsWith("'") && part.endsWith("'")) ||
        (part.startsWith('"') && part.endsWith('"'))
      ) {
        return part.slice(1, -1);
      }
      if (/^-?\d+(\.\d+)?$/.test(part)) {
        return Number(part);
      }
      if (part === "true") return true;
      if (part === "false") return false;
      return undefined;
    });

  if (
    values.length === 0 ||
    values.some((value) => typeof value === "undefined")
  ) {
    return null;
  }

  return values;
}

export class RouteParser {
  options: AutoSwaggerOptions;
  constructor(options: AutoSwaggerOptions) {
    this.options = options;
  }

  /*
    extract path-variables, tags and the uri-pattern
  */
  extractInfos(p: string) {
    let parameters: Record<string, any> = {};
    let pattern = "";
    let tags: string[] = [];
    let required: boolean;

    const split = p.split("/");
    if (split.length > this.options.tagIndex) {
      tags = [split[this.options.tagIndex].toUpperCase()];
    }
    split.forEach((part) => {
      if (part.startsWith(":")) {
        required = !part.endsWith("?");
        const param = part.replace(":", "").replace("?", "");
        part = "{" + param + "}";
        parameters = {
          ...parameters,
          [param]: {
            in: "path",
            name: param,
            schema: {
              type: "string",
            },
            required: required,
          },
        };
      }
      pattern += "/" + part;
    });
    if (pattern.endsWith("/")) {
      pattern = pattern.slice(0, -1);
    }
    return { tags, parameters, pattern };
  }
}

export class ModelParser {
  exampleGenerator: ExampleGenerator;
  snakeCase: boolean;
  constructor(snakeCase: boolean) {
    this.snakeCase = snakeCase;
    this.exampleGenerator = new ExampleGenerator({});
  }

  parseModelProperties(data) {
    let props: Record<string, any> = {};
    let required: string[] = [];
    // remove empty lines
    data = data.replace(/\t/g, "").replace(/^(?=\n)$|^\s*|\s*$|\n\n+/gm, "");
    const lines = data.split("\n");
    let softDelete = false;
    let name = "";
    lines.forEach((line, index) => {
      line = line.trim();
      // skip comments
      if (line.startsWith("export default class")) {
        name = line.split(" ")[3];
      }
      if (
        line.includes("@swagger-softdelete") ||
        line.includes("SoftDeletes")
      ) {
        softDelete = true;
      }

      if (
        line.startsWith("//") ||
        line.startsWith("/*") ||
        line.startsWith("*") ||
        line.startsWith("public static ") ||
        line.startsWith("private static ") ||
        line.startsWith("static ")
      )
        return;

      if (index > 0 && lines[index - 1].includes("serializeAs: null")) return;
      if (index > 0 && lines[index - 1].includes("@no-swagger")) return;
      if (
        !line.startsWith("public ") &&
        !line.startsWith("public get") &&
        !line.includes("declare ")
      )
        return;

      let s = [];

      if (line.includes("declare ")) {
        s = line.split("declare ");
      }
      if (line.startsWith("public ")) {
        if (line.startsWith("public get")) {
          s = line.split("public get");
          let s2 = s[1].replace(/;/g, "").split(":");
        } else {
          s = line.split("public ");
        }
      }

      let s2 = s[1].replace(/;/g, "").split(":");

      let field = s2[0];
      let type = s2[1] || "";
      type = type.trim();
      let enums: any[] = [];
      let format = "";
      let keyprops = {};
      let example: any = null;

      if (index > 0 && lines[index - 1].includes("@enum")) {
        const l = lines[index - 1];
        let en = getBetweenBrackets(l, "enum");
        if (en !== "") {
          enums = en.split(",");
          example = enums[0];
        }
      }

      if (index > 0 && lines[index - 1].includes("@format")) {
        const l = lines[index - 1];
        let en = getBetweenBrackets(l, "format");
        if (en !== "") {
          format = en;
        }
      }

      if (index > 0 && lines[index - 1].includes("@example")) {
        const l = lines[index - 1];
        let match = l.match(/example\(([^()]*)\)/g);
        if (match !== null) {
          const m = match[0].replace("example(", "").replace(")", "");
          example = m;
          if (type === "number") {
            example = parseInt(m);
          }
        }
      }

      if (index > 0 && lines[index - 1].includes("@required")) {
        required.push(field);
      }

      if (index > 0 && lines[index - 1].includes("@props")) {
        const l = lines[index - 1].replace("@props", "props");
        const j = getBetweenBrackets(l, "props");
        if (isJSONString(j)) {
          keyprops = JSON.parse(j);
        }
      }

      if (typeof type === "undefined") {
        type = "string";
        format = "";
      }

      field = field.trim();

      type = type.trim();

      const unionValues = parseLiteralUnionType(type);
      if (unionValues) {
        enums = unionValues;
        example = unionValues[0];
        type = inferEnumType(unionValues);
      } else if (type.includes(" | ")) {
        //TODO: make oneOf
        const types = type.split(" | ");
        type = types.filter((t) => t !== "null")[0];
      }

      field = field.replace("()", "");
      field = field.replace("get ", "");
      type = type.replace("{", "").trim();

      if (this.snakeCase) {
        field = snakeCase(field);
      }

      let indicator = "type";

      if (example === null) {
        example = "string";
      }

      // if relation to another model
      if (type.includes("typeof")) {
        s = type.split("typeof ");
        type = "#/components/schemas/" + s[1].slice(0, -1);
        indicator = "$ref";
      } else {
        if (standardTypes.includes(type.toLowerCase())) {
          type = type.toLowerCase();
        } else {
          // assume its a custom interface
          indicator = "$ref";
          type = "#/components/schemas/" + type;
        }
      }
      type = type.trim();
      let isArray = false;

      if (
        line.includes("HasMany") ||
        line.includes("ManyToMany") ||
        line.includes("HasManyThrough") ||
        type.includes("[]")
      ) {
        isArray = true;
        if (type.slice(type.length - 2, type.length) === "[]") {
          type = type.split("[]")[0];
        }
      }
      if (example === null || example === "string") {
        example =
          this.exampleGenerator.exampleByField(field) ||
          this.exampleGenerator.exampleByType(type);
      }

      if (type === "datetime") {
        indicator = "type";
        type = "string";
        format = "date-time";
      }

      if (type === "date") {
        indicator = "type";
        type = "string";
        format = "date";
      }

      if (field === "email") {
        indicator = "type";
        type = "string";
        format = "email";
      }
      if (field === "password") {
        indicator = "type";
        type = "string";
        format = "password";
      }

      if (enums.length > 0) {
        indicator = "type";
        type = inferEnumType(enums);
      }

      if (type === "any") {
        indicator = "$ref";
        type = "#/components/schemas/Any";
      }

      let prop = {};
      if (type === "integer" || type === "number") {
        if (example === null || example === "string") {
          example = Math.floor(Math.random() * 1000);
        }
      }
      if (type === "boolean") {
        example = true;
      }

      prop[indicator] = type;
      prop["example"] = example;
      // if array
      if (isArray) {
        props[field] = { type: "array", items: prop };
      } else {
        props[field] = prop;
        if (format !== "") {
          props[field]["format"] = format;
        }
      }
      Object.entries(keyprops).map(([key, value]) => {
        props[field][key] = value;
      });
      if (enums.length > 0) {
        props[field]["enum"] = enums;
      }
    });

    if (softDelete) {
      props["deleted_at"] = {
        type: "string",
        format: "date-time",
        example: "2021-03-23T16:13:08.489+01:00",
      };
    }

    return { name: name, props: props, required: required };
  }
}

export class ValidatorParser {
  exampleGenerator: ExampleGenerator;
  constructor() {
    this.exampleGenerator = new ExampleGenerator({});
  }
  async validatorToObject(validator: AutoSwaggerVineValidator) {
    // console.dir(validator.toJSON()["refs"], { depth: null });
    // console.dir(json, { depth: null });
    const obj = {
      type: "object",
      properties: this.parseSchema(
        validator.toJSON()["schema"]["schema"],
        validator.toJSON()["refs"]
      ),
    };
    // console.dir(obj, { depth: null });
    const testObj = this.objToTest(obj["properties"]);
    return await this.parsePropsAndMeta(obj, testObj, validator);
  }

  async parsePropsAndMeta(obj, testObj, validator: AutoSwaggerVineValidator) {
    // console.log(Object.keys(errors));
    const { SimpleMessagesProvider } = await import("@vinejs/vine");
    const [e] = await validator.tryValidate(testObj, {
      messagesProvider: new SimpleMessagesProvider({
        required: "REQUIRED",
        string: "TYPE",
        object: "TYPE",
        number: "TYPE",
        boolean: "TYPE",
      }),
    });

    // if no errors, this means all object-fields are of type number (which we use by default)
    // and we can return the object
    if (e === null) {
      obj["example"] = testObj;
      return obj;
    }

    const msgs = e.messages;

    for (const m of msgs) {
      const err = m["message"];
      let objField = m["field"].replace(".", ".properties.");
      if (m["field"].includes(".0")) {
        objField = objField.replaceAll(`.0`, ".items");
      }
      if (err === "TYPE") {
          lodash.set(obj["properties"], objField, {
          ...lodash.get(obj["properties"], objField),
          type: m["rule"],
          example: this.exampleGenerator.exampleByType(m["rule"]),
        });
        if (m["rule"] === "string") {
          if (lodash.get(obj["properties"], objField)["minimum"]) {
            lodash.set(obj["properties"], objField, {
              ...lodash.get(obj["properties"], objField),
              minLength: lodash.get(obj["properties"], objField)["minimum"],
            });
            lodash.unset(obj["properties"], objField + ".minimum");
          }
          if (lodash.get(obj["properties"], objField)["maximum"]) {
            lodash.set(obj["properties"], objField, {
              ...lodash.get(obj["properties"], objField),
              maxLength: lodash.get(obj["properties"], objField)["maximum"],
            });
            lodash.unset(obj["properties"], objField + ".maximum");
          }
        }

        lodash.set(
          testObj,
          m["field"],
          this.exampleGenerator.exampleByType(m["rule"])
        );
      }

      if (err === "FORMAT") {
        lodash.set(obj["properties"], objField, {
          ...lodash.get(obj["properties"], objField),
          format: m["rule"],
          type: "string",
          example: this.exampleGenerator.exampleByValidatorRule(m["rule"]),
        });
        lodash.set(
          testObj,
          m["field"],
          this.exampleGenerator.exampleByValidatorRule(m["rule"])
        );
      }
    }

    // console.dir(obj, { depth: null });
    obj["example"] = testObj;
    return obj;
  }

  objToTest(obj: any) {
    const res: Record<string, any> = {};
    Object.keys(obj).forEach((key) => {
      if (obj[key]["type"] === "object") {
        res[key] = this.objToTest(obj[key]["properties"]);
      } else if (obj[key]["type"] === "array") {
        if (obj[key]["items"]["type"] === "object") {
          res[key] = [this.objToTest(obj[key]["items"]["properties"])];
        } else {
          res[key] = [obj[key]["items"]["example"]];
        }
      } else {
        res[key] = obj[key]["example"];
      }
    });
    return res;
  }

  parseSchema(json, refs) {
    const obj: Record<string, any> = {};
    for (const p of json["properties"]) {
      let meta: {
        minimum?: number;
        maximum?: number;
        pattern?: string;
      } = {};
      for (const v of p["validations"]) {
        if (refs[v["ruleFnId"]].options?.min) {
          meta = { ...meta, minimum: refs[v["ruleFnId"]].options.min };
        }
        if (refs[v["ruleFnId"]].options?.max) {
          meta = { ...meta, maximum: refs[v["ruleFnId"]].options.max };
        }
        if (refs[v["ruleFnId"]].options?.toString().includes("/")) {
          meta = { ...meta, pattern: refs[v["ruleFnId"]].options.toString() };
        }
      }

      // console.dir(p, { depth: null });
      // console.dir(validations, { depth: null });
      // console.log(min, max, choices, regex);

      obj[p["fieldName"]] =
        p["type"] === "object"
          ? { type: "object", properties: this.parseSchema(p, refs) }
          : p["type"] === "array"
            ? {
                type: "array",
                items:
                  p["each"]["type"] === "object"
                    ? {
                        type: "object",
                        properties: this.parseSchema(p["each"], refs),
                      }
                    : this.parseLiteralSchema(p["each"], refs, meta),
              }
            : this.parseLiteralSchema(p, refs, meta);
      if (!p["isOptional"]) obj[p["fieldName"]]["required"] = true;
    }
    return obj;
  }

  private parseLiteralSchema(
    property: Record<string, any>,
    refs: Record<string, any>,
    meta: Record<string, any>
  ) {
    const choices = this.getEnumChoices(property, refs);
    if (choices) {
      return {
        ...enumSchema(choices),
        ...meta,
      };
    }

    const type = this.normalizeVineType(
      property["subtype"] ?? property["type"]
    );
    return {
      type,
      example: meta.minimum
        ? meta.minimum
        : this.exampleGenerator.exampleByType(type),
      ...meta,
    };
  }

  private getEnumChoices(
    property: Record<string, any>,
    refs: Record<string, any>
  ): any[] | null {
    for (const validation of property["validations"] ?? []) {
      const choices = refs[validation["ruleFnId"]]?.options?.choices;
      if (Array.isArray(choices)) return choices;
    }

    return null;
  }

  private normalizeVineType(type: string): string {
    if (type === "literal") return "number";
    if (["string", "number", "boolean"].includes(type)) return type;
    return "number";
  }
}

export class InterfaceParser {
  exampleGenerator: ExampleGenerator;
  snakeCase: boolean;
  schemas: any = {};

  constructor(snakeCase: boolean, schemas: any = {}) {
    this.snakeCase = snakeCase;
    this.exampleGenerator = new ExampleGenerator({});
    this.schemas = schemas;
  }

  objToExample(obj) {
    const example: Record<string, any> = {};

    Object.entries(obj).map(([key, value]) => {
      if (typeof value === "object") {
        example[key] = this.objToExample(value);
      } else {
        example[key] = this.exampleGenerator.exampleByType(value as string);
        if (example[key] === null) {
          example[key] = this.exampleGenerator.exampleByField(key);
        }
      }
    });
    return example;
  }

  parseProps(obj) {
    const no: Record<string, any> = {};

    Object.entries(obj).map(([f, value]) => {
      if (typeof value === "object") {
        no[f.replaceAll("?", "")] = {
          type: "object",
          nullable: f.includes("?"),
          properties: this.parseProps(value),
          example: this.objToExample(value),
        };
      } else {
        no[f.replaceAll("?", "")] = {
          ...this.parseType(value, f),
        };
      }
    });
    return no;
  }

  getInheritedProperties(baseType: string): any {
    if (this.schemas[baseType]?.properties) {
      return {
        properties: this.schemas[baseType].properties,
        required: this.schemas[baseType].required || [],
      };
    }

    const cleanType = baseType
      .split("/")
      .pop()
      ?.replace(".ts", "")
      ?.replace(/^[#@]/, "");

    if (!cleanType) return { properties: {}, required: [] };

    if (this.schemas[cleanType]?.properties) {
      return {
        properties: this.schemas[cleanType].properties,
        required: this.schemas[cleanType].required || [],
      };
    }

    const variations = [
      cleanType,
      `#models/${cleanType}`,
      cleanType.replace(/Model$/, ""),
      `${cleanType}Model`,
    ];

    for (const variation of variations) {
      if (this.schemas[variation]?.properties) {
        return {
          properties: this.schemas[variation].properties,
          required: this.schemas[variation].required || [],
        };
      }
    }

    return { properties: {}, required: [] };
  }

  private braceBalance(value: string): number {
    return (value.match(/{/g) || []).length - (value.match(/}/g) || []).length;
  }

  private trimType(type: string): string {
    return type.replace(/[;\r\n]+$/g, "").trim();
  }

  private splitPropertyLine(line: string): { prop: string; type: string } | null {
    const separator = line.indexOf(":");
    if (separator === -1) return null;

    const prop = line.slice(0, separator).trim();
    const type = this.trimType(line.slice(separator + 1));

    if (!prop || !type) return null;

    return { prop, type };
  }

  private parseInterfaceName(line: string): string | null {
    const match = line.match(
      /^(?:export\s+default\s+|export\s+)?interface\s+([A-Za-z_$][\w$]*)/
    );

    return match?.[1] ?? null;
  }

  private splitTopLevelProperties(body: string): string[] {
    const properties: string[] = [];
    let current = "";
    let depth = 0;
    let quote: string | null = null;

    for (const char of body) {
      if (quote) {
        current += char;
        if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === "'" || char === '"' || char === "`") {
        quote = char;
        current += char;
        continue;
      }

      if (char === "{") depth++;
      if (char === "}") depth--;

      if ((char === ";" || char === "," || char === "\n") && depth === 0) {
        const property = current.trim();
        if (property) properties.push(property);
        current = "";
        continue;
      }

      current += char;
    }

    const property = current.trim();
    if (property) properties.push(property);

    return properties;
  }

  private addInterfaceProperty(def, line: string, isRequired: boolean) {
    const parsed = this.splitPropertyLine(line);
    if (!parsed) return;

    const cleanProp = parsed.prop.replace("?", "");
    def.properties[cleanProp] = parsed.type;

    if (isRequired || !parsed.prop.includes("?")) {
      def.required.push(cleanProp);
    }
  }

  private objectExampleFromProperties(properties: Record<string, any>) {
    const example: Record<string, any> = {};

    for (const [key, value] of Object.entries(properties)) {
      if (value?.type === "object" && value.properties) {
        example[key] = this.objectExampleFromProperties(value.properties);
      } else if (value?.type === "array") {
        example[key] = [];
      } else if ("example" in value) {
        example[key] = value.example;
      } else {
        example[key] = this.exampleGenerator.exampleByField(key);
      }
    }

    return example;
  }

  private parseInlineObjectType(type: string) {
    const cleanType = this.trimType(type);
    if (!cleanType.startsWith("{") || !cleanType.endsWith("}")) return null;

    const body = cleanType.slice(1, -1).trim();
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const property of this.splitTopLevelProperties(body)) {
      const parsed = this.splitPropertyLine(property);
      if (!parsed) continue;

      const cleanProp = parsed.prop.replace("?", "");
      properties[cleanProp] = this.parseType(parsed.type, cleanProp);

      if (!parsed.prop.includes("?")) {
        required.push(cleanProp);
      }
    }

    const schema: Record<string, any> = {
      type: "object",
      properties,
      example: this.objectExampleFromProperties(properties),
    };

    if (required.length > 0) {
      schema.required = required;
    }

    return schema;
  }

  parseInterfaces(data) {
    data = data.replace(/\t/g, "").replace(/^(?=\n)$|^\s*|\s*$|\n\n+/gm, "");

    let currentInterface = null;
    let pendingObjectProperty: {
      interfaceName: string;
      line: string;
      required: boolean;
      depth: number;
    } | null = null;
    const interfaces: Record<string, any> = {};
    const interfaceDefinitions = new Map();

    const lines = data.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const isDefault = line.startsWith("export default interface");

      if (
        line.startsWith("interface") ||
        line.startsWith("export interface") ||
        isDefault
      ) {
        const name = this.parseInterfaceName(line);
        if (!name) continue;

        const extendedTypes = this.parseExtends(line);
        interfaceDefinitions.set(name, {
          extends: extendedTypes,
          properties: {},
          required: [],
          startLine: i,
        });
        currentInterface = name;

        const openingBrace = line.indexOf("{");
        const closingBrace = line.lastIndexOf("}");
        if (openingBrace !== -1 && closingBrace > openingBrace) {
          const body = line.slice(openingBrace + 1, closingBrace).trim();
          if (body) {
            for (const property of this.splitTopLevelProperties(body)) {
              this.addInterfaceProperty(
                interfaceDefinitions.get(name),
                property,
                false
              );
            }
          }
          currentInterface = null;
        }

        continue;
      }

      if (pendingObjectProperty) {
        pendingObjectProperty.line += "\n" + line;
        pendingObjectProperty.depth += this.braceBalance(line);

        if (pendingObjectProperty.depth <= 0) {
          const def = interfaceDefinitions.get(pendingObjectProperty.interfaceName);
          if (def) {
            this.addInterfaceProperty(
              def,
              pendingObjectProperty.line,
              pendingObjectProperty.required
            );
          }
          pendingObjectProperty = null;
        }

        continue;
      }

      if (currentInterface && line === "}") {
        currentInterface = null;
        continue;
      }

      if (
        currentInterface &&
        line &&
        !line.startsWith("//") &&
        !line.startsWith("/*") &&
        !line.startsWith("*")
      ) {
        const def = interfaceDefinitions.get(currentInterface);
        if (def) {
          const previousLine = i > 0 ? lines[i - 1].trim() : "";
          const isRequired = previousLine.includes("@required");

          const parsed = this.splitPropertyLine(line);
          if (parsed) {
            const depth = this.braceBalance(parsed.type);
            if (parsed.type.startsWith("{") && depth > 0) {
              pendingObjectProperty = {
                interfaceName: currentInterface,
                line,
                required: isRequired,
                depth,
              };
              continue;
            }

            this.addInterfaceProperty(def, line, isRequired);
          }
        }
      }
    }

    for (const [name, def] of interfaceDefinitions) {
      let allProperties = {};
      let requiredFields = new Set(def.required);

      for (const baseType of def.extends) {
        const baseSchema = this.schemas[baseType];
        if (baseSchema) {
          if (baseSchema.properties) {
            Object.assign(allProperties, baseSchema.properties);
          }

          if (baseSchema.required) {
            baseSchema.required.forEach((field) => requiredFields.add(field));
          }
        }
      }

      Object.assign(allProperties, def.properties);

      const parsedProperties: Record<string, any> = {};
      for (const [key, value] of Object.entries(allProperties)) {
        if (typeof value === "object" && value !== null && "type" in value) {
          parsedProperties[key] = value;
        } else {
          parsedProperties[key] = this.parseType(value, key);
        }
      }

      const schema = {
        type: "object",
        properties: parsedProperties,
        required: Array.from(requiredFields),
        description: `${name}${def.extends.length ? ` extends ${def.extends.join(", ")}` : ""} (Interface)`,
      };

      if (schema.required.length === 0) {
        delete schema.required;
      }

      interfaces[name] = schema;
    }

    return interfaces;
  }

  parseExtends(line: string): string[] {
    const matches = line.match(/extends\s+([^{]+)/);
    if (!matches) return [];

    return matches[1]
      .split(",")
      .map((type) => type.trim())
      .map((type) => {
        const cleanType = type.split("/").pop();
        return cleanType?.replace(/\.ts$/, "") || type;
      });
  }

  parseType(type: string | any, field: string) {
    if (typeof type === "object" && type !== null && "type" in type) {
      return type;
    }

    let isArray = false;
    if (typeof type === "string" && type.includes("[]")) {
      type = type.replace("[]", "");
      isArray = true;
    }

    if (typeof type === "string") {
      type = this.trimType(type);
    }

    let prop: any = { type: type };
    let notRequired = field.includes("?");
    prop.nullable = notRequired;

    const unionValues =
      typeof type === "string" ? parseLiteralUnionType(type) : null;
    const inlineObject =
      typeof type === "string" ? this.parseInlineObjectType(type) : null;

    if (inlineObject) {
      prop = {
        ...inlineObject,
        nullable: notRequired,
      };
    } else if (unionValues) {
      prop = {
        ...enumSchema(unionValues),
        nullable: notRequired,
      };
    } else if (typeof type === "string" && type.toLowerCase() === "datetime") {
      prop.type = "string";
      prop.format = "date-time";
      prop.example = "2021-03-23T16:13:08.489+01:00";
    } else if (typeof type === "string" && type.toLowerCase() === "date") {
      prop.type = "string";
      prop.format = "date";
      prop.example = "2021-03-23";
    } else {
      const standardTypes = ["string", "number", "boolean", "integer"];
      if (
        typeof type === "string" &&
        !standardTypes.includes(type.toLowerCase())
      ) {
        delete prop.type;
        prop.$ref = `#/components/schemas/${type}`;
      } else {
        if (typeof type === "string") {
          prop.type = type.toLowerCase();
        }
        prop.example =
          this.exampleGenerator.exampleByType(type) ||
          this.exampleGenerator.exampleByField(field);
      }
    }

    if (isArray) {
      return {
        type: "array",
        items: prop,
      };
    }

    return prop;
  }
}

export class EnumParser {
  constructor() {}

  parseEnums(data: string): Record<string, any> {
    const enums: Record<string, any> = {};
    const lines = data.split("\n");
    let currentEnum: string | null = null;
    let description: string | null = null;
    let nextNumericValue = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith("//")) {
        description = trimmedLine.slice(2).trim();
        continue;
      }

      if (
        trimmedLine.startsWith("enum") ||
        trimmedLine.startsWith("export enum")
      ) {
        const match = trimmedLine.match(/(?:export\s+)?enum\s+(\w+)/);
        if (match) {
          currentEnum = match[1];
          enums[currentEnum] = {
            type: "integer",
            enum: [],
            properties: {},
            description: description || `${startCase(currentEnum)} enumeration`,
          };
          nextNumericValue = 0;
          description = null;
        }
        continue;
      }

      if (currentEnum && trimmedLine !== "{" && trimmedLine !== "}") {
        const [key, value] = trimmedLine.split("=").map((s) => s.trim());
        if (key) {
          const enumValue = value
            ? this.parseEnumValue(value)
            : nextNumericValue;
          enums[currentEnum].enum.push(enumValue);
          enums[currentEnum].type = inferEnumType(enums[currentEnum].enum);
          if (typeof enumValue === "number") {
            nextNumericValue = Math.trunc(enumValue) + 1;
          } else {
            nextNumericValue = 0;
          }
        }
      }

      if (trimmedLine === "}") {
        currentEnum = null;
      }
    }

    return enums;
  }

  private parseEnumValue(value: string): any {
    const normalized = value.replace(/,$/, "").trim();

    if (
      (normalized.startsWith("'") && normalized.endsWith("'")) ||
      (normalized.startsWith('"') && normalized.endsWith('"'))
    ) {
      return normalized.slice(1, -1);
    }

    if (/^-?\d+(\.\d+)?$/.test(normalized)) {
      return Number(normalized);
    }

    return normalized.replace(/['"]/g, "").trim();
  }
}
