export type AutoSwaggerPrimitiveType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object"
  | "datetime"
  | "date"
  | "any";

export type AutoSwaggerJsonValue =
  | string
  | number
  | boolean
  | null
  | AutoSwaggerJsonValue[]
  | { [key: string]: AutoSwaggerJsonValue };

export interface AutoSwaggerSchema {
  type?: AutoSwaggerPrimitiveType | string;
  format?: string;
  example?: AutoSwaggerJsonValue;
  enum?: AutoSwaggerJsonValue[];
  required?: boolean | string[];
  nullable?: boolean;
  properties?: AutoSwaggerSchemaMap;
  items?: AutoSwaggerSchema;
  $ref?: string;
  oneOf?: AutoSwaggerSchema[];
  anyOf?: AutoSwaggerSchema[];
  allOf?: AutoSwaggerSchema[];
  [key: string]: AutoSwaggerJsonValue | AutoSwaggerSchema | AutoSwaggerSchema[] | AutoSwaggerSchemaMap | undefined;
}

export type AutoSwaggerSchemaMap = Record<string, AutoSwaggerSchema>;

export interface AutoSwaggerVineValidationMessage {
  field: string;
  message: string;
  rule: string;
}

export interface AutoSwaggerVineValidationError {
  messages: AutoSwaggerVineValidationMessage[];
}

export interface AutoSwaggerVineValidator {
  toJSON(): unknown;
  tryValidate(...args: any[]): Promise<[AutoSwaggerVineValidationError | null, unknown]>;
}

export type AutoSwaggerSchemaReference =
  | string
  | AutoSwaggerVineValidator
  | { name: string }
  | Function;

export type AutoSwaggerBody =
  | AutoSwaggerSchemaReference
  | AutoSwaggerJsonValue
  | AutoSwaggerSchemaMap;

export interface AutoSwaggerHeader {
  description?: string;
  schema?: AutoSwaggerSchema;
}

export type AutoSwaggerHeaderMap = Record<string, AutoSwaggerHeader>;

export interface AutoSwaggerParameter {
  description?: string;
  type?: AutoSwaggerPrimitiveType | string;
  required?: boolean;
  example?: AutoSwaggerJsonValue;
  enum?: AutoSwaggerJsonValue[];
  schema?: AutoSwaggerSchema;
}

export type AutoSwaggerParameterMap = Record<string, AutoSwaggerParameter>;

export interface AutoSwaggerResponse {
  body?: AutoSwaggerBody;
  description?: string;
  headers?: AutoSwaggerHeaderMap;
}

export type AutoSwaggerResponseValue = AutoSwaggerBody | AutoSwaggerResponse;

export type AutoSwaggerResponseMap = Record<string | number, AutoSwaggerResponseValue>;

export type AutoSwaggerResponseHeaderUseMap = Record<string | number, string[]>;

export interface AutoSwaggerOptions {
  summary?: string;
  description?: string;
  hideControllerPath?: boolean;
  tag?: string;
  operationId?: string;
  requestBody?: AutoSwaggerBody;
  requestFormDataBody?: AutoSwaggerBody;
  responseBody?: AutoSwaggerResponseMap;
  responseHeaderUse?: AutoSwaggerResponseHeaderUseMap;
  paramUse?: string[];
  paramPath?: AutoSwaggerParameterMap;
  paramQuery?: AutoSwaggerParameterMap;
  paramHeader?: AutoSwaggerParameterMap;
  paramCookie?: AutoSwaggerParameterMap;
}

const prototypeMetadata = new WeakMap<
  object,
  Map<string | symbol, AutoSwaggerOptions>
>();

const methodMetadata = new WeakMap<Function, AutoSwaggerOptions>();

function setPrototypeMetadata(
  target: object,
  propertyKey: string | symbol,
  options: AutoSwaggerOptions
) {
  const metadata = prototypeMetadata.get(target) ?? new Map();
  metadata.set(propertyKey, options);
  prototypeMetadata.set(target, metadata);
}

export function getAutoSwaggerOptions(
  controller: Function | undefined,
  propertyKey: string | symbol
): AutoSwaggerOptions | undefined {
  if (!controller?.prototype) {
    return undefined;
  }

  const byPrototype = prototypeMetadata.get(controller.prototype)?.get(propertyKey);
  if (byPrototype) {
    return byPrototype;
  }

  const method = controller.prototype[propertyKey];
  if (typeof method === "function") {
    return methodMetadata.get(method);
  }

  return undefined;
}

export function AutoSwagger(options: AutoSwaggerOptions) {
  return (...args: [object, string | symbol, PropertyDescriptor] | [Function, ClassMethodDecoratorContext]) => {
    if (args.length === 3) {
      const [target, propertyKey] = args;
      setPrototypeMetadata(target, propertyKey, options);
      return;
    }

    const [value, context] = args;
    if (context.kind === "method") {
      methodMetadata.set(value, options);
    }
  };
}
