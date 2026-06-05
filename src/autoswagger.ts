import lodash from "lodash";
import fs, { existsSync } from "node:fs";
import { STATUS_CODES } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import util from "node:util";
import { stringify as stringifyYaml } from "yaml";
import { serializeV6Handler, serializeV6Middleware } from "./adonishelpers.js";
import type {
  AutoSwaggerBody,
  AutoSwaggerDecoratorOptions,
  AutoSwaggerHeaderMap,
  AutoSwaggerParameterMap,
  AutoSwaggerResponse,
  AutoSwaggerResponseMap,
  AutoSwaggerResponseValue,
  AutoSwaggerSchema,
  AutoSwaggerVineValidator,
} from "./decorators.js";
import { getAutoSwaggerOptions } from "./decorators.js";
import {
  EnumParser,
  InterfaceParser,
  ModelParser,
  RouteParser,
  ValidatorParser,
} from "./parsers.js";
import { scalarCustomCss } from "./scalarCustomCss.js";
import type {
  AdonisRoute,
  AdonisRoutes,
  AutoSwaggerConfigOptions,
  V6Handler,
} from "./types.js";

import ExampleGenerator, { ExampleInterfaces } from "./example.js";
import { formatOperationId, mergeParams } from "./helpers.js";

const { isEmpty, isUndefined } = lodash;

function statusMessage(code: string | number): string {
  return STATUS_CODES[String(code)] ?? String(code);
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = escaped.replaceAll("*", ".*").replaceAll("?", ".");
  return new RegExp(`^${regex}$`);
}

type OpenApiContent = Record<string, Record<string, unknown>>;
type OpenApiRequestBody = { content: OpenApiContent };
type OpenApiResponse = {
  description?: string;
  content?: OpenApiContent;
  headers?: AutoSwaggerHeaderMap;
};
type DecoratorAnnotations = {
  description: string;
  hideControllerPath?: boolean;
  responses: Record<string, OpenApiResponse>;
  requestBody?: OpenApiRequestBody;
  parameters: Record<string, unknown>;
  summary: string;
  operationId?: string;
  tag: string;
};

const bodyWrapperKeys = ["body", "description", "headers"];

export class AutoSwaggerGenerator {
  private options: AutoSwaggerConfigOptions;
  private schemas: Record<string, any> = {};
  private exampleGenerator: ExampleGenerator;
  private modelParser: ModelParser;
  private interfaceParser: InterfaceParser;
  private enumParser: EnumParser;
  private routeParser: RouteParser;
  private validatorParser: ValidatorParser;
  private customPaths: Record<string, any> = {};

  ui(url: string, options?: AutoSwaggerConfigOptions) {
    const persistAuthString = options?.persistAuthorization
      ? "persistAuthorization: true,"
      : "";
    return `<!DOCTYPE html>
		<html lang="en">
		<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<meta http-equiv="X-UA-Compatible" content="ie=edge">
				<script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.1.3/swagger-ui-standalone-preset.js"></script>
				<script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.1.3/swagger-ui-bundle.js"></script>
				<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.1.3/swagger-ui.css" />
				<title>Documentation</title>
		</head>
		<body>
				<div id="swagger-ui"></div>
				<script>
						window.onload = function() {
							SwaggerUIBundle({
								url: "${url}",
								dom_id: '#swagger-ui',
								presets: [
									SwaggerUIBundle.presets.apis,
									SwaggerUIStandalonePreset
								],
								layout: "BaseLayout",
                ${persistAuthString}
							})
						}
				</script>
		</body>
		</html>`;
  }

  rapidoc(url: string, style = "view") {
    return (
      `
    <!doctype html> <!-- Important: must specify -->
    <html>
      <head>
        <meta charset="utf-8"> <!-- Important: rapi-doc uses utf8 characters -->
        <script type="module" src="https://unpkg.com/rapidoc/dist/rapidoc-min.js"></script>
        <title>Documentation</title>
      </head>
      <body>
        <rapi-doc
          spec-url = "` +
      url +
      `"
      theme = "dark"
      bg-color = "#24283b"
      schema-style="tree"
      schema-expand-level = "10"
      header-color = "#1a1b26"
      allow-try = "true"
      nav-hover-bg-color = "#1a1b26"
      nav-bg-color = "#24283b"
      text-color = "#c0caf5"
      nav-text-color = "#c0caf5"
      primary-color = "#9aa5ce"
      heading-text = "Documentation"
      sort-tags = "true"
      render-style = "` +
      style +
      `"
      default-schema-tab = "example"
      show-components = "true"
      allow-spec-url-load = "false"
      allow-spec-file-load = "false"
      sort-endpoints-by = "path"

        > </rapi-doc>
      </body>
    </html>
    `
    );
  }

  scalar(url: string, proxyUrl: string = "https://proxy.scalar.com") {
    return `
      <!doctype html>
      <html>
        <head>
          <title>API Reference</title>
          <meta charset="utf-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1" />
          <style>
          ${scalarCustomCss}
          </style>
        </head>
        <body>
          <script
            id="api-reference"
            data-url="${url}"
            data-proxy-url="${proxyUrl}"></script>
          <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
        </body>
      </html>
    `;
  }

  stoplight(url: string, theme: "light" | "dark" = "dark") {
    return `
      <!doctype html>
      <html data-theme="${theme}">
        <head>
          <title>API Documentation - Stoplight</title>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
		  <script src="https://unpkg.com/@stoplight/elements/web-components.min.js"></script>
          <link rel="stylesheet" href="https://unpkg.com/@stoplight/elements/styles.min.css">
        </head>
        <body style="min-height:100vh">
	      <elements-api
		    style="display:block;height:100vh;width:100%;"
		    apiDescriptionUrl=${url}
		    router="hash"
		    layout="sidebar"
		  />
        </body>
      </html>
    `;
  }

  jsonToYaml(json: unknown): string {
    return stringifyYaml(json);
  }

  async json(routes: any, options: AutoSwaggerConfigOptions) {
    if (process.env.NODE_ENV === (options.productionEnv || "production")) {
      const str = await this.readFile(options.path, "json");
      return JSON.parse(str);
    }
    return await this.generate(routes, options);
  }

  async writeFile(routes: any, options: AutoSwaggerConfigOptions) {
    const json = await this.generate(routes, options);
    const contents = this.jsonToYaml(json);
    const filePath = options.path + "swagger.yml";
    const filePathJson = options.path + "swagger.json";

    fs.writeFileSync(filePath, contents);
    fs.writeFileSync(filePathJson, JSON.stringify(json, null, 2));
  }

  private async readFile(rootPath, type = "yml") {
    const filePath = rootPath + "swagger." + type;
    const data = fs.readFileSync(filePath, "utf-8");
    if (!data) {
      console.error("Error reading file");
      return;
    }
    return data;
  }

  async docs(routes: any, options: AutoSwaggerConfigOptions) {
    if (process.env.NODE_ENV === (options.productionEnv || "production")) {
      return this.readFile(options.path);
    }
    return this.jsonToYaml(await this.generate(routes, options));
  }

  private async generate(
    adonisRoutes: AdonisRoutes,
    options: AutoSwaggerConfigOptions
  ) {
    this.options = {
      ...{
        snakeCase: true,
        preferredPutPatch: "PUT",
        debug: false,
      },
      ...options,
    };

    const routes = adonisRoutes.root;
    this.options.appPath = this.options.path + "app";

    try {
      const pj = fs.readFileSync(path.join(this.options.path, "package.json"));

      const pjson = JSON.parse(pj.toString());
      if (pjson.imports) {
        Object.entries(pjson.imports).forEach(([key, value]) => {
          const k = (key as string).replaceAll("/*", "");
          this.customPaths[k] = (value as string)
            .replaceAll("/*.js", "")
            .replaceAll("./", "");
        });
      }
    } catch (e) {
      console.error(e);
    }

    this.routeParser = new RouteParser(this.options);
    this.modelParser = new ModelParser(this.options.snakeCase);
    this.interfaceParser = new InterfaceParser(this.options.snakeCase);
    this.validatorParser = new ValidatorParser();
    this.enumParser = new EnumParser();
    this.schemas = await this.getSchemas();
    if (this.options.debug) {
      console.log(this.options);
      console.log("Found Schemas", Object.keys(this.schemas));
      console.log("Using custom paths", this.customPaths);
    }
    this.exampleGenerator = new ExampleGenerator(this.schemas);

    const docs = {
      openapi: "3.0.0",
      info: options.info || {
        title: options.title,
        version: options.version,
        description:
          options.description ||
          "Generated by AdonisJS AutoSwagger https://github.com/gabbrieu/adonis-autoswagger",
      },
      components: {
        responses: {
          Forbidden: {
            description: "Access token is missing or invalid",
          },
          Accepted: {
            description: "The request was accepted",
          },
          Created: {
            description: "The resource has been created",
          },
          NotFound: {
            description: "The resource has been created",
          },
          NotAcceptable: {
            description: "The resource has been created",
          },
        },
        securitySchemes: {
          BearerAuth: {
            type: "http",
            scheme: "bearer",
          },
          BasicAuth: {
            type: "http",
            scheme: "basic",
          },
          ApiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "X-API-Key",
          },
          ...this.options.securitySchemes,
        },
        schemas: this.schemas,
      },
      paths: {},
      tags: [],
    };
    let paths = {};

    let sscheme = "BearerAuth";
    if (this.options.defaultSecurityScheme) {
      sscheme = this.options.defaultSecurityScheme;
    }

    let securities = {
      "auth": { [sscheme]: ["access"] },
      "auth:api": { [sscheme]: ["access"] },
      ...this.options.authMiddlewares
        ?.map((am) => ({
          [am]: { [sscheme]: ["access"] },
        }))
        .reduce((acc, val) => ({ ...acc, ...val }), {}),
    };

    let globalTags = [];

    if (this.options.debug) {
      console.log("Route decorators:");
      console.log("Checking if controllers have AutoSwagger decorators");
      console.log("-----");
    }

    const ignoredRoutes = options.ignore.map(globToRegExp);

    for await (const route of routes) {
      let ignore = false;
      for (const ignoredRoute of ignoredRoutes) {
        if (ignoredRoute.test(route.pattern)) {
          ignore = true;
          break;
        }
      }
      if (ignore) continue;

      let security = [];
      const responseCodes = {
        GET: "200",
        POST: "201",
        DELETE: "202",
        PUT: "204",
      };

      if (!Array.isArray(route.middleware)) {
        route.middleware = serializeV6Middleware(route.middleware) as string[];
      }

      (route.middleware as string[]).forEach((m) => {
        if (typeof securities[m] !== "undefined") {
          security.push(securities[m]);
        }
      });

      let { tags, parameters, pattern } = this.routeParser.extractInfos(
        route.pattern
      );

      tags.forEach((tag) => {
        if (globalTags.filter((e) => e.name === tag).length > 0) return;
        if (tag === "") return;
        globalTags.push({
          name: tag,
          description: "Everything related to " + tag,
        });
      });

      const { sourceFile, action, decoratorAnnotations, operationId } =
        await this.getDataBasedOnAdonisVersion(route);

      route.methods.forEach((method) => {
        let responses = {};
        if (method === "HEAD") return;

        if (
          route.methods.includes("PUT") &&
          route.methods.includes("PATCH") &&
          method !== this.options.preferredPutPatch
        )
          return;

        let description = "";
        let summary = "";
        let tag = "";
        let operationId: string;

        if (security.length > 0) {
          responses["401"] = {
            description: `Returns **401** (${statusMessage(401)})`,
          };
          responses["403"] = {
            description: `Returns **403** (${statusMessage(403)})`,
          };
        }

        let requestBody: OpenApiRequestBody = {
          content: {
            "application/json": {},
          },
        };

        let actionParams = {};

        if (action !== "" && decoratorAnnotations) {
          description = decoratorAnnotations.description;
          summary = decoratorAnnotations.summary;
          operationId = decoratorAnnotations.operationId;
          responses = { ...responses, ...decoratorAnnotations.responses };
          requestBody = decoratorAnnotations.requestBody ?? requestBody;
          actionParams = decoratorAnnotations.parameters;
          tag = decoratorAnnotations.tag;
        }
        parameters = mergeParams(parameters, actionParams);

        if (tag != "") {
          globalTags.push({
            name: tag.toUpperCase(),
            description: "Everything related to " + tag.toUpperCase(),
          });
          tags = [tag.toUpperCase()];
        }

        if (isEmpty(responses)) {
          responses[responseCodes[method]] = {
            description: statusMessage(responseCodes[method]),
            content: {
              "application/json": {},
            },
          };
        } else {
          if (
            typeof responses[responseCodes[method]] !== "undefined" &&
            typeof responses[responseCodes[method]]["summary"] !== "undefined"
          ) {
            if (summary === "") {
              summary = responses[responseCodes[method]]["summary"];
            }
            delete responses[responseCodes[method]]["summary"];
          }
          if (
            typeof responses[responseCodes[method]] !== "undefined" &&
            typeof responses[responseCodes[method]]["description"] !==
              "undefined"
          ) {
            description = responses[responseCodes[method]]["description"];
          }
        }

        if (action !== "" && summary === "") {
          // Solve toLowerCase undefined exception
          // https://github.com/gabbrieu/adonis-autoswagger/issues/28
          tags[0] = tags[0] ?? "";

          switch (action) {
            case "index":
              summary = "Get a list of " + tags[0].toLowerCase();
              break;
            case "show":
              summary = "Get a single instance of " + tags[0].toLowerCase();
              break;
            case "update":
              summary = "Update " + tags[0].toLowerCase();
              break;
            case "destroy":
              summary = "Delete " + tags[0].toLowerCase();
              break;
            case "store":
              summary = "Create " + tags[0].toLowerCase();
              break;
            // frontend defaults
            case "create":
              summary = "Create (Frontend) " + tags[0].toLowerCase();
              break;
            case "edit":
              summary = "Update (Frontend) " + tags[0].toLowerCase();
              break;
          }
        }

        const showControllerPath =
          decoratorAnnotations?.hideControllerPath === false ||
          (decoratorAnnotations?.hideControllerPath !== true &&
            this.options.showFullPath === true);
        const controllerDescription = showControllerPath
          ? "\n\n _" + sourceFile + "_ - **" + action + "**"
          : "";
        let m = {
          summary: `${summary}${action !== "" ? ` (${action})` : "route"}`,
          description: description + controllerDescription,
          operationId: operationId,
          parameters: parameters,
          tags: tags,
          responses: responses,
          security: security,
        };

        if (method !== "GET" && method !== "DELETE") {
          m["requestBody"] = requestBody;
        }

        pattern = pattern.slice(1);
        if (pattern === "") {
          pattern = "/";
        }

        paths = {
          ...paths,
          [pattern]: { ...paths[pattern], [method.toLowerCase()]: m },
        };
      });
    }

    // filter unused tags
    const usedTags = lodash.uniq(
      Object.entries(paths)
        .map(([p, val]) => Object.entries(val)[0][1].tags)
        .flat()
    );

    docs.tags = globalTags.filter((tag) => usedTags.includes(tag.name));
    docs.paths = paths;
    return docs;
  }

  private async getDataBasedOnAdonisVersion(route: AdonisRoute) {
    let sourceFile = "";
    let action = "";
    let decoratorAnnotations: DecoratorAnnotations | undefined;
    let operationId = "";
    if (
      route.meta.resolvedHandler !== null &&
      route.meta.resolvedHandler !== undefined
    ) {
      if (
        typeof route.meta.resolvedHandler.namespace !== "undefined" &&
        route.meta.resolvedHandler.method !== "handle"
      ) {
        sourceFile = route.meta.resolvedHandler.namespace;

        action = route.meta.resolvedHandler.method;
        // If not defined by an annotation, use the combination of "controllerNameMethodName"
        if (action !== "" && isUndefined(operationId) && route.handler) {
          operationId = formatOperationId(route.handler as string);
        }
      }
    }

    let v6handler = <V6Handler>route.handler;
    if (
      v6handler.reference !== null &&
      v6handler.reference !== undefined &&
      v6handler.reference !== ""
    ) {
      if (!Array.isArray(v6handler.reference)) {
        // handles magic strings
        // router.resource('/test', '#controllers/test_controller')
        [sourceFile, action] = v6handler.reference.split(".");
        const split = sourceFile.split("/");

        if (split[0].includes("#")) {
          sourceFile = sourceFile.replaceAll(
            split[0],
            this.customPaths[split[0]]
          );
        } else {
          sourceFile = this.options.appPath + "/controllers/" + sourceFile;
        }
        operationId = formatOperationId(v6handler.reference);
      } else {
        // handles lazy import
        // const TestController = () => import('#controllers/test_controller')
        const serializedHandler = await serializeV6Handler(v6handler);
        if (serializedHandler.type !== "controller") {
          return { sourceFile, action, decoratorAnnotations, operationId };
        }
        action = serializedHandler.method;
        sourceFile = serializedHandler.moduleNameOrPath;
        operationId = formatOperationId(sourceFile + "." + action);
        const split = sourceFile.split("/");
        if (split[0].includes("#")) {
          sourceFile = sourceFile.replaceAll(
            split[0],
            this.customPaths[split[0]]
          );
        } else {
          sourceFile = this.options.appPath + "/" + sourceFile;
        }
      }
    }

    if (sourceFile !== "" && action !== "") {
      sourceFile = sourceFile.replace("App/", "app/") + ".ts";
      sourceFile = sourceFile.replace(".js", "");

      decoratorAnnotations = await this.getDecoratorAnnotations(
        sourceFile,
        action
      );
    }
    if (
      typeof decoratorAnnotations !== "undefined" &&
      typeof decoratorAnnotations.operationId !== "undefined" &&
      decoratorAnnotations.operationId !== ""
    ) {
      operationId = decoratorAnnotations.operationId;
    }
    if (this.options.debug) {
      if (sourceFile !== "") {
        console.log(
          typeof decoratorAnnotations !== "undefined" &&
            !lodash.isEmpty(decoratorAnnotations)
            ? `\x1b[32m✓ FOUND for ${action}\x1b[0m`
            : `\x1b[33m✗ MISSING for ${action}\x1b[0m`,

          `${sourceFile} (${route.methods[0].toUpperCase()} ${route.pattern})`
        );
      }
    }
    return { sourceFile, action, decoratorAnnotations, operationId };
  }

  private async getDecoratorAnnotations(
    sourceFile: string,
    action: string
  ): Promise<DecoratorAnnotations | undefined> {
    const controller = await this.importController(sourceFile, action);
    const decoratorOptions = getAutoSwaggerOptions(controller, action);
    if (!decoratorOptions) {
      return undefined;
    }
    return this.toDecoratorAnnotations(decoratorOptions);
  }

  private async importController(
    sourceFile: string,
    action: string
  ): Promise<Function | undefined> {
    try {
      const controllerPath = path.isAbsolute(sourceFile)
        ? sourceFile
        : path.join(this.options.path, sourceFile);
      const controllerModule = await import(pathToFileURL(controllerPath).href);

      if (
        typeof controllerModule.default === "function" &&
        typeof controllerModule.default.prototype?.[action] === "function"
      ) {
        return controllerModule.default;
      }

      for (const exported of Object.values(controllerModule)) {
        if (
          typeof exported === "function" &&
          typeof exported.prototype?.[action] === "function"
        ) {
          return exported;
        }
      }
    } catch (e) {
      console.error("\x1b[31m✗ Controller import failed\x1b[0m", sourceFile);
      console.error(e.message);
    }

    return undefined;
  }

  private async toDecoratorAnnotations(
    options: AutoSwaggerDecoratorOptions
  ): Promise<DecoratorAnnotations> {
    const responses = await this.toResponses(options.responseBody);
    const headersByStatus = this.resolveResponseHeaderUses(
      options.responseHeaderUse
    );

    for (const [status, headers] of Object.entries(headersByStatus)) {
      responses[status] = {
        ...responses[status],
        headers: {
          ...responses[status]?.headers,
          ...headers,
        },
      };
      if (!responses[status].description) {
        responses[status].description =
          `Returns **${status}** (${statusMessage(status)})`;
      }
    }

    return {
      description: options.description ?? "",
      hideControllerPath: options.hideControllerPath,
      responses,
      requestBody: await this.toRequestBody(
        options.requestFormDataBody ?? options.requestBody,
        options.requestFormDataBody ? "multipart/form-data" : "application/json"
      ),
      parameters: this.toParameters(options),
      summary: options.summary ?? "",
      operationId: options.operationId,
      tag: options.tag ?? "",
    };
  }

  private async toResponses(
    responseBody?: AutoSwaggerResponseMap
  ): Promise<Record<string, OpenApiResponse>> {
    const responses: Record<string, OpenApiResponse> = {};
    if (!responseBody) {
      return responses;
    }

    for (const [status, responseValue] of Object.entries(responseBody)) {
      const response = this.normalizeResponse(responseValue);
      const bodyContent = await this.toContent(
        response.body,
        "application/json"
      );
      responses[status] = {
        ...(bodyContent ? { content: bodyContent } : {}),
        ...(response.description ? { description: response.description } : {}),
        ...(response.headers ? { headers: response.headers } : {}),
      };

      if (!responses[status].description) {
        responses[status].description = bodyContent
          ? `Returns **${status}** (${statusMessage(status)}) as **${Object.keys(bodyContent)[0]}**`
          : `Returns **${status}** (${statusMessage(status)})`;
      }
    }

    return responses;
  }

  private normalizeResponse(
    responseValue: AutoSwaggerResponseValue
  ): AutoSwaggerResponse {
    if (
      this.isPlainObject(responseValue) &&
      Object.keys(responseValue).some((key) => bodyWrapperKeys.includes(key))
    ) {
      return responseValue as AutoSwaggerResponse;
    }

    return { body: responseValue as AutoSwaggerBody };
  }

  private async toRequestBody(
    body: AutoSwaggerBody | undefined,
    mediaType: string
  ): Promise<OpenApiRequestBody | undefined> {
    if (mediaType === "multipart/form-data") {
      return this.toFormDataRequestBody(body);
    }

    const content = await this.toContent(body, mediaType);
    return content ? { content } : undefined;
  }

  private async toFormDataRequestBody(
    body: AutoSwaggerBody | undefined
  ): Promise<OpenApiRequestBody | undefined> {
    if (typeof body === "undefined") {
      return undefined;
    }

    const schema = await this.toFormDataSchema(body);
    return {
      content: {
        "multipart/form-data": {
          schema,
        },
      },
    };
  }

  private async toFormDataSchema(
    body: AutoSwaggerBody
  ): Promise<AutoSwaggerSchema> {
    if (this.isVineValidator(body)) {
      const schema = await this.validatorParser.validatorToObject(body);
      return {
        type: "object",
        properties: schema.properties,
      };
    }

    if (typeof body === "string" && body.includes("<") && body.includes(">")) {
      const rawRef = body.substring(
        body.indexOf("<") + 1,
        body.lastIndexOf(">")
      );
      const cleanedRef = rawRef.replace("[]", "");
      const schema = this.schemas[cleanedRef];
      if (!schema?.properties) {
        return { type: "object", properties: {} };
      }

      const example = this.exampleGenerator.parseRef(body, true);
      const exampleObject = Array.isArray(example) ? example[0] : example;
      const properties = Object.entries(schema.properties).reduce<
        Record<string, AutoSwaggerSchema>
      >((result, [key, value]) => {
        if (
          this.isPlainObject(exampleObject) &&
          typeof exampleObject[key] === "undefined"
        ) {
          return result;
        }

        result[key] = this.isPlainObject(value)
          ? (value as AutoSwaggerSchema)
          : this.toSchema(value as AutoSwaggerBody);
        return result;
      }, {});

      return {
        type: "object",
        properties,
        ...(Array.isArray(schema.required)
          ? { required: schema.required }
          : {}),
      };
    }

    return this.toSchema(body);
  }

  private async toContent(
    body: AutoSwaggerBody | undefined,
    mediaType: string
  ): Promise<OpenApiContent | undefined> {
    if (typeof body === "undefined") {
      return undefined;
    }

    const parsedReference = await this.toReferenceContent(body);
    if (parsedReference) {
      return parsedReference;
    }

    const schema = this.toSchema(body);
    const example = this.toExample(body);
    return {
      [mediaType]: {
        schema,
        example,
      },
    };
  }

  private async toReferenceContent(
    body: AutoSwaggerBody
  ): Promise<OpenApiContent | undefined> {
    if (typeof body === "string") {
      if (body.includes("<") && body.includes(">")) {
        return (
          this.exampleGenerator.parseRef(body) as { content: OpenApiContent }
        ).content;
      }
      return undefined;
    }

    if (this.isVineValidator(body)) {
      const schema = await this.validatorParser.validatorToObject(body);
      return {
        "application/json": {
          schema,
          example: schema.example,
        },
      };
    }

    const schemaName = this.getSchemaName(body);
    if (schemaName && this.schemas[schemaName]) {
      return (
        this.exampleGenerator.parseRef(`<${schemaName}>`) as {
          content: OpenApiContent;
        }
      ).content;
    }

    return undefined;
  }

  private toSchema(body: AutoSwaggerBody): AutoSwaggerSchema {
    if (Array.isArray(body)) {
      return {
        type: "array",
        items: body.length > 0 ? this.toSchema(body[0]) : { type: "string" },
      };
    }

    if (this.isPlainObject(body) && this.isOpenApiSchema(body)) {
      return body as AutoSwaggerSchema;
    }

    if (this.isPlainObject(body)) {
      const required: string[] = [];
      const properties: Record<string, AutoSwaggerSchema> = {};

      for (const [key, value] of Object.entries(body)) {
        const schema = this.toSchema(value as AutoSwaggerBody);
        if (schema.required === true) {
          required.push(key);
          delete schema.required;
        }
        properties[key] = schema;
      }

      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }

    if (typeof body === "string") {
      if (this.isKnownType(body)) {
        return this.schemaByType(body);
      }
      return { type: "string", example: body };
    }

    if (typeof body === "number") {
      return {
        type: Number.isInteger(body) ? "integer" : "number",
        example: body,
      };
    }

    if (typeof body === "boolean") {
      return { type: "boolean", example: body };
    }

    return { $ref: "#/components/schemas/Any" };
  }

  private toExample(body: AutoSwaggerBody): unknown {
    if (Array.isArray(body)) {
      return body.map((item) => this.toExample(item as AutoSwaggerBody));
    }

    if (typeof body === "string") {
      if (body.includes("<") && body.includes(">")) {
        return this.exampleGenerator.parseRef(body, true);
      }
      if (this.isKnownType(body)) {
        return this.exampleGenerator.exampleByType(body) ?? body;
      }
      return body;
    }

    if (this.isPlainObject(body)) {
      if (this.isOpenApiSchema(body)) {
        const schema = body as AutoSwaggerSchema;
        return (
          schema.example ?? this.exampleGenerator.exampleByType(schema.type)
        );
      }

      return Object.entries(body).reduce<Record<string, unknown>>(
        (result, [key, value]) => {
          result[key] = this.toExample(value as AutoSwaggerBody);
          return result;
        },
        {}
      );
    }

    return body;
  }

  private toParameters(
    options: AutoSwaggerDecoratorOptions
  ): Record<string, unknown> {
    return {
      ...this.toCommonParameters(options.paramUse),
      ...this.toParameterLocation("path", options.paramPath),
      ...this.toParameterLocation("query", options.paramQuery),
      ...this.toParameterLocation("header", options.paramHeader),
      ...this.toParameterLocation("cookie", options.paramCookie),
    };
  }

  private toCommonParameters(names: string[] = []): Record<string, unknown> {
    return names.reduce<Record<string, unknown>>((parameters, name) => {
      const common = this.options.common.parameters[name];
      if (!Array.isArray(common)) {
        return parameters;
      }

      common.forEach((parameter) => {
        if (parameter?.name) {
          parameters[parameter.name] = parameter;
        }
      });
      return parameters;
    }, {});
  }

  private toParameterLocation(
    location: string,
    parameterMap?: AutoSwaggerParameterMap
  ): Record<string, unknown> {
    if (!parameterMap) {
      return {};
    }

    return Object.entries(parameterMap).reduce<Record<string, unknown>>(
      (parameters, [name, parameter]) => {
        parameters[name] = {
          in: location,
          name,
          description: parameter.description ?? "",
          schema: parameter.schema ?? {
            type: parameter.type ?? "string",
            example:
              parameter.example ??
              this.exampleGenerator.exampleByType(parameter.type ?? "string"),
            ...(parameter.enum ? { enum: parameter.enum } : {}),
          },
          required: parameter.required ?? (location === "path" ? true : false),
        };
        return parameters;
      },
      {}
    );
  }

  private resolveResponseHeaderUses(
    responseHeaderUse: AutoSwaggerDecoratorOptions["responseHeaderUse"]
  ): Record<string, AutoSwaggerHeaderMap> {
    const headersByStatus: Record<string, AutoSwaggerHeaderMap> = {};
    if (!responseHeaderUse) {
      return headersByStatus;
    }

    for (const [status, headerNames] of Object.entries(responseHeaderUse)) {
      headersByStatus[status] = headerNames.reduce<AutoSwaggerHeaderMap>(
        (headers, name) => ({
          ...headers,
          ...this.options.common.headers[name],
        }),
        {}
      );
    }

    return headersByStatus;
  }

  private getSchemaName(body: AutoSwaggerBody): string | undefined {
    if (typeof body === "function") {
      return body.name;
    }

    if (
      typeof body === "object" &&
      body !== null &&
      !Array.isArray(body) &&
      !this.isPlainObject(body) &&
      "name" in body &&
      typeof body.name === "string"
    ) {
      return body.name;
    }

    return undefined;
  }

  private isKnownType(type: string): boolean {
    return [
      "string",
      "number",
      "integer",
      "datetime",
      "date",
      "boolean",
      "object",
      "array",
      "any",
    ].includes(type);
  }

  private schemaByType(type: string): AutoSwaggerSchema {
    if (type === "datetime") {
      return {
        type: "string",
        format: "date-time",
        example: this.exampleGenerator.exampleByType(type),
      };
    }

    if (type === "date") {
      return {
        type: "string",
        format: "date",
        example: this.exampleGenerator.exampleByType(type),
      };
    }

    if (type === "any") {
      return { $ref: "#/components/schemas/Any" };
    }

    return {
      type,
      example: this.exampleGenerator.exampleByType(type),
    };
  }

  private isOpenApiSchema(value: Record<string, unknown>): boolean {
    return [
      "type",
      "$ref",
      "properties",
      "items",
      "oneOf",
      "anyOf",
      "allOf",
    ].some((key) => key in value);
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }
    return Object.getPrototypeOf(value) === Object.prototype;
  }

  private isVineValidator(value: unknown): value is AutoSwaggerVineValidator {
    return (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { toJSON?: unknown }).toJSON === "function" &&
      typeof (value as { tryValidate?: unknown }).tryValidate === "function" &&
      value.constructor.name.includes("VineValidator")
    );
  }

  private getNoSwaggerEntityNames(data: string): Set<string> {
    const hiddenEntities = new Set<string>();
    const lines = data.split("\n");
    const declarationPattern =
      /^(?:export\s+default\s+|export\s+)?(?:abstract\s+)?(?:class|interface|enum|type|const)\s+([A-Za-z_$][\w$]*)/;

    lines.forEach((line, index) => {
      const match = line.trim().match(declarationPattern);
      if (!match) return;

      for (let i = index - 1; i >= 0; i--) {
        const previousLine = lines[i].trim();
        if (previousLine === "") continue;
        if (previousLine.includes("@no-swagger")) {
          hiddenEntities.add(match[1]);
        }

        if (
          previousLine.startsWith("//") ||
          previousLine.startsWith("/*") ||
          previousLine.startsWith("*")
        ) {
          continue;
        }

        break;
      }
    });

    return hiddenEntities;
  }

  private withoutNoSwaggerEntities<T extends Record<string, any>>(
    entities: T,
    hiddenEntities: Set<string>
  ): T {
    const visibleEntities = Object.entries(entities).reduce<
      Record<string, any>
    >((result, [key, value]) => {
      if (!hiddenEntities.has(key)) {
        result[key] = value;
      }
      return result;
    }, {});

    return visibleEntities as T;
  }

  private async getSchemas() {
    let schemas = {
      Any: {
        description: "Any JSON object not defined as schema",
      },
    };

    schemas = {
      ...schemas,
      ...(await this.getInterfaces()),
      ...(await this.getSerializers()),
      ...(await this.getModels()),
      ...(await this.getValidators()),
      ...(await this.getEnums()),
    };

    return schemas;
  }

  private async getValidators() {
    const validators = {};
    let p6 = path.join(this.options.appPath, "validators");

    if (typeof this.customPaths["#validators"] !== "undefined") {
      // it's v6
      p6 = p6.replaceAll("app/validators", this.customPaths["#validators"]);
      p6 = p6.replaceAll("app\\validators", this.customPaths["#validators"]);
    }

    if (!existsSync(p6)) {
      if (this.options.debug) {
        console.log("Validators paths don't exist", p6);
      }
      return validators;
    }

    const files = await this.getFiles(p6, []);
    if (this.options.debug) {
      console.log("Found validator files", files);
    }

    try {
      for (let file of files) {
        if (/^[a-zA-Z]:/.test(file)) {
          file = "file:///" + file;
        }

        const data = await fs.promises.readFile(
          file.replace("file:///", ""),
          "utf8"
        );
        const hiddenValidators = this.getNoSwaggerEntityNames(data);
        const val = await import(file);
        for (const [key, value] of Object.entries(val)) {
          if (hiddenValidators.has(key)) continue;

          if (value.constructor.name.includes("VineValidator")) {
            validators[key] = await this.validatorParser.validatorToObject(
              value as AutoSwaggerVineValidator
            );
            validators[key].description = key + " (Validator)";
          }
        }
      }
    } catch (e) {
      console.log(
        "**You are probably using 'node ace serve --hmr', which is not supported yet. Use 'node ace serve --watch' instead.**"
      );
      console.error(e.message);
    }

    return validators;
  }

  private async getSerializers() {
    const serializers = {};
    let p6 = path.join(this.options.appPath, "serializers");

    if (typeof this.customPaths["#serializers"] !== "undefined") {
      // it's v6
      p6 = p6.replaceAll("app/serializers", this.customPaths["#serializers"]);
      p6 = p6.replaceAll("app\\serializers", this.customPaths["#serializers"]);
    }

    if (!existsSync(p6)) {
      if (this.options.debug) {
        console.log("Serializers paths don't exist", p6);
      }
      return serializers;
    }

    const files = await this.getFiles(p6, []);
    if (this.options.debug) {
      console.log("Found serializer files", files);
    }

    for (let file of files) {
      if (/^[a-zA-Z]:/.test(file)) {
        file = "file:///" + file;
      }

      const val = await import(file);

      for (const [key, value] of Object.entries(val)) {
        if (key.indexOf("Serializer") > -1) {
          serializers[key] = value;
        }
      }
    }

    return serializers;
  }

  private async getModels() {
    const models = {};
    let p = path.join(this.options.appPath, "Models");
    let p6 = path.join(this.options.appPath, "models");

    if (typeof this.customPaths["#models"] !== "undefined") {
      // it's v6
      p6 = p6.replaceAll("app/models", this.customPaths["#models"]);
      p6 = p6.replaceAll("app\\models", this.customPaths["#models"]);
    }

    if (!existsSync(p) && !existsSync(p6)) {
      if (this.options.debug) {
        console.log("Model paths don't exist", p, p6);
      }
      return models;
    }
    if (existsSync(p6)) {
      p = p6;
    }
    const files = await this.getFiles(p, []);
    const readFile = util.promisify(fs.readFile);
    if (this.options.debug) {
      console.log("Found model files", files);
    }
    for (let file of files) {
      file = file.replace(".js", "");
      const data = await readFile(file, "utf8");
      const hiddenModels = this.getNoSwaggerEntityNames(data);
      file = file.replace(".ts", "");
      const split = file.split("/");
      let name = split[split.length - 1].replace(".ts", "");
      file = file.replace("app/", "/app/");
      const parsed = this.modelParser.parseModelProperties(data);
      if (parsed.name !== "") {
        name = parsed.name;
      }
      if (hiddenModels.has(name)) continue;

      let schema = {
        type: "object",
        required: parsed.required,
        properties: parsed.props,
        description: name + " (Model)",
      };
      models[name] = schema;
    }
    return models;
  }

  private async getInterfaces() {
    let interfaces = {
      ...ExampleInterfaces.paginationInterface(),
    };
    let p = path.join(this.options.appPath, "Interfaces");
    let p6 = path.join(this.options.appPath, "interfaces");

    if (typeof this.customPaths["#interfaces"] !== "undefined") {
      // it's v6
      p6 = p6.replaceAll("app/interfaces", this.customPaths["#interfaces"]);
      p6 = p6.replaceAll("app\\interfaces", this.customPaths["#interfaces"]);
    }

    if (!existsSync(p) && !existsSync(p6)) {
      if (this.options.debug) {
        console.log("Interface paths don't exist", p, p6);
      }
      return interfaces;
    }
    if (existsSync(p6)) {
      p = p6;
    }
    const files = await this.getFiles(p, []);
    if (this.options.debug) {
      console.log("Found interfaces files", files);
    }
    const readFile = util.promisify(fs.readFile);
    for (let file of files) {
      file = file.replace(".js", "");
      const data = await readFile(file, "utf8");
      const hiddenInterfaces = this.getNoSwaggerEntityNames(data);
      file = file.replace(".ts", "");
      const parsedInterfaces = this.interfaceParser.parseInterfaces(data);
      interfaces = {
        ...interfaces,
        ...this.withoutNoSwaggerEntities(parsedInterfaces, hiddenInterfaces),
      };
    }

    return interfaces;
  }

  private async getFiles(dir, files_) {
    files_ = files_ || [];
    var files = await fs.readdirSync(dir);
    for (let i in files) {
      var name = dir + "/" + files[i];
      if (fs.statSync(name).isDirectory()) {
        await this.getFiles(name, files_);
      } else {
        files_.push(name);
      }
    }
    return files_;
  }

  private async getEnums() {
    let enums = {};

    const enumParser = new EnumParser();

    let p = path.join(this.options.appPath, "Types");
    let p6 = path.join(this.options.appPath, "types");

    if (typeof this.customPaths["#types"] !== "undefined") {
      // it's v6
      p6 = p6.replaceAll("app/types", this.customPaths["#types"]);
      p6 = p6.replaceAll("app\\types", this.customPaths["#types"]);
    }

    if (!existsSync(p) && !existsSync(p6)) {
      if (this.options.debug) {
        console.log("Enum paths don't exist", p, p6);
      }
      return enums;
    }

    if (existsSync(p6)) {
      p = p6;
    }

    const files = await this.getFiles(p, []);
    if (this.options.debug) {
      console.log("Found enum files", files);
    }

    const readFile = util.promisify(fs.readFile);
    for (let file of files) {
      file = file.replace(".js", "");
      const data = await readFile(file, "utf8");
      const hiddenEnums = this.getNoSwaggerEntityNames(data);
      file = file.replace(".ts", "");
      const split = file.split("/");
      const name = split[split.length - 1].replace(".ts", "");
      file = file.replace("app/", "/app/");

      const parsedEnums = enumParser.parseEnums(data);
      enums = {
        ...enums,
        ...this.withoutNoSwaggerEntities(parsedEnums, hiddenEnums),
      };
    }

    return enums;
  }
}
